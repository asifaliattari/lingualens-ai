import { ipcMain, clipboard, app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { IPC } from '../shared/channels'
import type {
  AiProvider,
  CaptureRegion,
  LensContent,
  LensOptions,
  Settings,
  ShortcutDef,
  TranslateRequest
} from '../shared/types'
import { getSettings, saveSettings, setApiKey, hasApiKey, clearApiKey, clearAllData } from './store'
import { translateText } from './translate'
import { ocrBuffer, OCR_LANG_MAP } from './ocr'
import { captureRegionPng } from './capture'
import { addHistory, listHistory, deleteHistory, clearHistory } from './history'
import { registerShortcuts, unregisterShortcuts, type ShortcutRegistration } from './shortcuts'
import { speak, stop as ttsStop, getVoices } from './tts'
import { LiveSession } from './live'
import * as windows from './windows'

const liveSession = new LiveSession()
let clipboardWatchTimer: NodeJS.Timeout | null = null
let lastClipboardText = ''
let lastShortcutResults: ShortcutRegistration[] = []
let overlayResolve: ((region: CaptureRegion | null) => void) | null = null

// ---------- helpers ----------

function mainWin(): BrowserWindow | null {
  return windows.getMainWindow()
}

function sendToMain(channel: string, payload: unknown): void {
  mainWin()?.webContents.send(channel, payload)
}

function sendLensContent(content: LensContent): void {
  windows.getLensWindow()?.webContents.send(IPC.lensContent, content)
}

function setCaptureIndicator(active: boolean): void {
  sendToMain(IPC.captureIndicator, { active })
}

function lensOptionsFromSettings(s: Settings): LensOptions {
  return {
    opacity: s.lensOpacity,
    mode: s.lensMode,
    layout: 'expanded',
    fontSize: s.lensFontSize,
    lineHeight: s.lensLineHeight,
    rotation: 0,
    locked: false,
    pinned: true
  }
}

function validTranslateRequest(raw: unknown): TranslateRequest {
  const r = (raw ?? {}) as Partial<TranslateRequest>
  const sourceLangs = ['auto', 'en', 'fr', 'de', 'nl']
  const targetLangs = ['simple-en', 'ur']
  const text = String(r.text ?? '')
  if (!sourceLangs.includes(String(r.sourceLang))) throw new Error('Invalid source language.')
  if (!targetLangs.includes(String(r.targetLang))) throw new Error('Invalid target language.')
  if (r.provider !== undefined && !['gemini', 'openai'].includes(String(r.provider))) {
    throw new Error('Invalid provider.')
  }
  return {
    text,
    sourceLang: r.sourceLang as TranslateRequest['sourceLang'],
    targetLang: r.targetLang as TranslateRequest['targetLang'],
    provider: r.provider as AiProvider | undefined,
    explain: Boolean(r.explain),
    romanUrdu: Boolean(r.romanUrdu),
    complex: r.complex === undefined ? undefined : Boolean(r.complex)
  }
}

function validRegion(raw: unknown): CaptureRegion | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const nums = ['x', 'y', 'width', 'height', 'displayId'].map((k) => Number(r[k]))
  if (nums.some((n) => !Number.isFinite(n))) return null
  const [x, y, width, height, displayId] = nums
  if (width < 10 || height < 10 || width > 10000 || height > 10000) return null
  return { x, y, width, height, displayId }
}

function saveCapturePng(png: Buffer): void {
  try {
    const dir = path.join(app.getPath('userData'), 'captures')
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, `capture-${Date.now()}.png`), png)
  } catch {
    /* screenshots are best-effort and never block translation */
  }
}

// ---------- region selection overlay ----------

function selectRegion(): Promise<CaptureRegion | null> {
  return new Promise((resolve) => {
    overlayResolve = resolve
    try {
      const win = windows.createOverlayWindow()
      win.show()
      win.focus()
      win.on('closed', () => {
        if (overlayResolve) {
          overlayResolve = null
          resolve(null)
        }
      })
    } catch {
      overlayResolve = null
      resolve(null)
    }
  })
}

function resolveOverlay(region: CaptureRegion | null): void {
  const res = overlayResolve
  overlayResolve = null
  windows.closeOverlayWindow()
  if (res) res(region)
}

// ---------- capture -> OCR -> translate flows ----------

async function ocrRegion(region: CaptureRegion): Promise<{ text: string; confidence: number }> {
  const png = await captureRegionPng(region)
  const settings = getSettings()
  if (settings.saveScreenshots) saveCapturePng(png)
  const ocrLangs =
    settings.sourceLang === 'auto' ? settings.ocrLangs : [OCR_LANG_MAP[settings.sourceLang] ?? 'eng']
  const ocr = await ocrBuffer(png, ocrLangs)
  if (!ocr.ok || !ocr.text) throw new Error(ocr.error ?? 'OCR did not recognize any text.')
  return { text: ocr.text, confidence: ocr.confidence ?? 0 }
}

/** Shortcut-driven flow: capture, OCR, translate, show in lens. */
async function handleShortcutCapture(): Promise<void> {
  try {
    const region = await selectRegion()
    if (!region) return
    const settings = getSettings()
    setCaptureIndicator(true)
    try {
      const { text } = await ocrRegion(region)
      windows.showLens()
      sendLensContent({
        original: text,
        translated: '',
        targetLang: settings.targetLang,
        status: 'loading',
        updatedAt: Date.now()
      })
      const res = await translateText({
        text,
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang
      })
      sendLensContent({
        original: text,
        translated: res.ok && res.translatedText ? res.translatedText : '',
        detectedLang: res.detectedLang,
        targetLang: settings.targetLang,
        status: res.ok ? 'ready' : 'error',
        error: res.ok ? undefined : res.error,
        updatedAt: Date.now()
      })
    } finally {
      setCaptureIndicator(false)
    }
  } catch (err) {
    const settings = getSettings()
    windows.showLens()
    sendLensContent({
      original: '',
      translated: '',
      targetLang: settings.targetLang,
      status: 'error',
      error: err instanceof Error ? err.message : 'Capture failed.',
      updatedAt: Date.now()
    })
  }
}

async function handleTranslateClipboard(): Promise<void> {
  const text = (await clipboard.readText()).trim()
  const settings = getSettings()
  if (!text) {
    windows.showLens()
    sendLensContent({
      original: '',
      translated: '',
      targetLang: settings.targetLang,
      status: 'error',
      error: 'The clipboard is empty. Copy some text first, then try again.',
      updatedAt: Date.now()
    })
    return
  }
  windows.showLens()
  sendLensContent({
    original: text,
    translated: '',
    targetLang: settings.targetLang,
    status: 'loading',
    updatedAt: Date.now()
  })
  const res = await translateText({ text, sourceLang: settings.sourceLang, targetLang: settings.targetLang })
  sendLensContent({
    original: text,
    translated: res.ok && res.translatedText ? res.translatedText : '',
    detectedLang: res.detectedLang,
    targetLang: settings.targetLang,
    status: res.ok ? 'ready' : 'error',
    error: res.ok ? undefined : res.error,
    updatedAt: Date.now()
  })
}

// ---------- shortcuts ----------

export function applyShortcuts(): void {
  const settings = getSettings()
  lastShortcutResults = registerShortcuts(settings.shortcuts, {
    toggleLens: () => windows.toggleLens(),
    translateClipboard: () => void handleTranslateClipboard(),
    captureRegion: () => void handleShortcutCapture(),
    refreshLive: () => liveSession.refresh()
  })
}

function applyLoginItem(): void {
  if (!app.isPackaged) return
  try {
    app.setLoginItemSettings({ openAtLogin: getSettings().startWithWindows })
  } catch {
    /* not critical */
  }
}

// ---------- clipboard watch (opt-in, off by default) ----------

async function setClipboardWatch(enabled: boolean): Promise<void> {
  if (clipboardWatchTimer) {
    clearInterval(clipboardWatchTimer)
    clipboardWatchTimer = null
  }
  if (!enabled) return
  lastClipboardText = await clipboard.readText()
  clipboardWatchTimer = setInterval(() => {
    void (async () => {
      const text = (await clipboard.readText()).trim()
      if (!text || text === lastClipboardText || text.length > 8000) return
      lastClipboardText = text
      const settings = getSettings()
      windows.showLens()
      sendLensContent({
        original: text,
        translated: '',
        targetLang: settings.targetLang,
        status: 'loading',
        updatedAt: Date.now()
      })
      const res = await translateText({ text, sourceLang: settings.sourceLang, targetLang: settings.targetLang })
      sendLensContent({
        original: text,
        translated: res.ok && res.translatedText ? res.translatedText : '',
        detectedLang: res.detectedLang,
        targetLang: settings.targetLang,
        status: res.ok ? 'ready' : 'error',
        error: res.ok ? undefined : res.error,
        updatedAt: Date.now()
      })
    })()
  }, 1200)
}

// ---------- IPC registration ----------

export function registerIpc(): void {
  ipcMain.handle(IPC.translate, async (_e, raw) => {
    const req = validTranslateRequest(raw)
    const result = await translateText(req)
    const settings = getSettings()
    if (result.ok && result.translatedText && settings.historyEnabled && !settings.privateMode) {
      try {
        addHistory({
          originalText: result.originalText,
          translatedText: result.translatedText,
          sourceLang: result.detectedLang ?? req.sourceLang,
          targetLang: result.targetLang,
          provider: result.provider ?? settings.provider
        })
      } catch {
        /* history must never break translation */
      }
    }
    return result
  })

  ipcMain.handle(IPC.getSettings, () => getSettings())

  ipcMain.handle(IPC.saveSettings, (_e, partial: Partial<Settings>) => {
    const next = saveSettings(partial ?? {})
    applyShortcuts()
    applyLoginItem()
    setClipboardWatch(next.clipboardWatch)
    const lens = windows.getLensWindow()
    lens?.webContents.send(IPC.lensOptions, lensOptionsFromSettings(next))
    return next
  })

  ipcMain.handle(IPC.setApiKey, (_e, provider: string, key: string) => {
    if (!['gemini', 'openai'].includes(provider)) throw new Error('Unknown provider.')
    const clean = String(key ?? '').trim()
    if (clean.length < 8) throw new Error('That key looks too short.')
    setApiKey(provider, clean)
    return { ok: true }
  })

  ipcMain.handle(IPC.hasApiKey, (_e, provider: string) => hasApiKey(String(provider)))
  ipcMain.handle(IPC.clearApiKey, (_e, provider: string) => {
    clearApiKey(String(provider))
    return { ok: true }
  })

  ipcMain.handle(IPC.lensShow, () => {
    windows.showLens()
    return { ok: true }
  })
  ipcMain.handle(IPC.lensHide, () => {
    windows.hideLens()
    return { ok: true }
  })
  ipcMain.handle(IPC.lensToggle, () => {
    windows.toggleLens()
    return { ok: true }
  })
  ipcMain.handle(IPC.lensSetContent, (_e, content: LensContent) => {
    windows.showLens()
    sendLensContent(content)
    return { ok: true }
  })
  ipcMain.handle(IPC.lensSetOptions, (_e, options: Partial<LensOptions>) => {
    windows.getLensWindow()?.webContents.send(IPC.lensOptions, options)
    return { ok: true }
  })
  ipcMain.handle(IPC.lensSetBounds, (_e, bounds: Partial<Electron.Rectangle>) => {
    const win = windows.getLensWindow()
    if (!win) return { ok: false as const }
    const displays = windows.getDisplays()
    const minX = Math.min(...displays.map((d) => d.workArea.x))
    const minY = Math.min(...displays.map((d) => d.workArea.y))
    const maxX = Math.max(...displays.map((d) => d.workArea.x + d.workArea.width))
    const maxY = Math.max(...displays.map((d) => d.workArea.y + d.workArea.height))
    const b = win.getBounds()
    const next = {
      x: Math.round(Math.min(Math.max(bounds.x ?? b.x, minX), maxX - 120)),
      y: Math.round(Math.min(Math.max(bounds.y ?? b.y, minY), maxY - 80)),
      width: Math.round(Math.min(Math.max(bounds.width ?? b.width, 240), maxX - minX)),
      height: Math.round(Math.min(Math.max(bounds.height ?? b.height, 160), maxY - minY))
    }
    win.setBounds(next)
    return { ok: true as const, bounds: win.getBounds() }
  })
  ipcMain.handle(IPC.lensGetBounds, () => {
    const win = windows.getLensWindow()
    return win ? win.getBounds() : null
  })
  ipcMain.handle(IPC.lensSetPinned, (_e, pinned: boolean) => {
    windows.getLensWindow()?.setAlwaysOnTop(Boolean(pinned), 'screen-saver')
    return { ok: true }
  })

  ipcMain.handle(IPC.openSettings, () => {
    windows.createSettingsWindow()
    return { ok: true }
  })

  ipcMain.on(IPC.overlayResult, (_e, raw) => {
    resolveOverlay(validRegion(raw))
  })

  ipcMain.handle(IPC.captureRegion, async () => {
    const region = await selectRegion()
    if (!region) return { cancelled: true as const }
    setCaptureIndicator(true)
    try {
      const { text, confidence } = await ocrRegion(region)
      return { cancelled: false as const, region, text, confidence }
    } catch (err) {
      return {
        cancelled: false as const,
        region,
        text: '',
        confidence: 0,
        error: err instanceof Error ? err.message : 'Capture failed.'
      }
    } finally {
      setCaptureIndicator(false)
    }
  })

  ipcMain.handle(IPC.ocrDataUrl, async (_e, dataUrl: string) => {
    const m = String(dataUrl ?? '').match(/^data:image\/\w+;base64,(.+)$/)
    if (!m) throw new Error('Invalid image data.')
    const buf = Buffer.from(m[1], 'base64')
    if (buf.length > 15 * 1024 * 1024) throw new Error('Image is too large.')
    const settings = getSettings()
    return ocrBuffer(buf, settings.ocrLangs)
  })

  ipcMain.handle(IPC.liveStart, async () => {
    const region = await selectRegion()
    if (!region) return { ok: false as const, cancelled: true as const }
    const settings = getSettings()
    liveSession.start(region, settings.captureIntervalMs, {
      onContent: (content) => {
        windows.showLens()
        sendLensContent(content)
      },
      onStatus: (status) => sendToMain(IPC.liveStatusEvent, status),
      onIndicator: (active) => setCaptureIndicator(active)
    })
    return { ok: true as const, region }
  })
  ipcMain.handle(IPC.livePause, () => {
    liveSession.pause()
    return liveSession.status()
  })
  ipcMain.handle(IPC.liveResume, () => {
    liveSession.resume()
    return liveSession.status()
  })
  ipcMain.handle(IPC.liveStop, () => {
    liveSession.stop()
    return liveSession.status()
  })
  ipcMain.handle(IPC.liveRefresh, () => {
    liveSession.refresh()
    return liveSession.status()
  })
  ipcMain.handle(IPC.liveStatus, () => liveSession.status())

  ipcMain.handle(IPC.translateClipboard, () => handleTranslateClipboard())
  ipcMain.handle(IPC.setClipboardWatch, (_e, enabled: boolean) => {
    setClipboardWatch(Boolean(enabled))
    return { ok: true }
  })

  ipcMain.handle(IPC.historyList, (_e, query: string, limit: number) =>
    listHistory(String(query ?? ''), Number(limit) || 100)
  )
  ipcMain.handle(IPC.historyDelete, (_e, id: number) => {
    deleteHistory(Number(id))
    return { ok: true }
  })
  ipcMain.handle(IPC.historyClear, () => {
    clearHistory()
    return { ok: true }
  })
  ipcMain.handle(IPC.historyExport, (_e, format: string) => {
    const fmt = format === 'csv' ? 'csv' : 'txt'
    const items = listHistory('', 2000)
    let content: string
    if (fmt === 'csv') {
      const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
      content = ['id,created_at,source_lang,target_lang,provider,original,translation']
        .concat(
          items.map((i) =>
            [i.id, i.createdAt, i.sourceLang, i.targetLang, i.provider, esc(i.originalText), esc(i.translatedText)].join(',')
          )
        )
        .join('\n')
    } else {
      content = items
        .map(
          (i) =>
            `[${i.createdAt}] ${i.sourceLang} -> ${i.targetLang} (${i.provider})\nOriginal: ${i.originalText}\nTranslation: ${i.translatedText}\n`
        )
        .join('\n---\n')
    }
    const filePath = path.join(app.getPath('downloads'), `lingualens-history-${Date.now()}.${fmt}`)
    fs.writeFileSync(filePath, content, 'utf8')
    return { ok: true, path: filePath, count: items.length }
  })

  ipcMain.handle(IPC.getShortcuts, () => ({
    shortcuts: getSettings().shortcuts,
    results: lastShortcutResults
  }))
  ipcMain.handle(IPC.setShortcut, (_e, action: ShortcutDef['action'], accelerator: string) => {
    const actions: ShortcutDef['action'][] = ['toggleLens', 'translateClipboard', 'captureRegion', 'refreshLive']
    if (!actions.includes(action)) throw new Error('Unknown shortcut action.')
    const acc = String(accelerator ?? '').trim()
    if (!/^[A-Za-z0-9+ ]+$/.test(acc) || acc.length > 40) throw new Error('Invalid shortcut format.')
    const next = saveSettings({ shortcuts: { ...getSettings().shortcuts, [action]: acc } })
    void next
    applyShortcuts()
    return { ok: true, results: lastShortcutResults }
  })

  ipcMain.handle(IPC.ttsSpeak, (_e, text: string, lang: string) => {
    const settings = getSettings()
    return speak(String(text ?? ''), settings.speechVoice, settings.speechRate)
      .then(() => ({ ok: true as const }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : 'Speech failed.'
      }))
  })
  ipcMain.handle(IPC.ttsStop, () => {
    ttsStop()
    return { ok: true }
  })
  ipcMain.handle(IPC.ttsVoices, () =>
    getVoices()
      .then((voices) => ({ ok: true as const, voices }))
      .catch((err: unknown) => ({
        ok: false as const,
        error: err instanceof Error ? err.message : 'Could not list voices.'
      }))
  )

  ipcMain.handle(IPC.getDisplays, () => windows.getDisplays())
  ipcMain.handle(IPC.getVersion, () => app.getVersion())
  ipcMain.handle(IPC.clearAllData, () => {
    liveSession.stop()
    setClipboardWatch(false)
    clearHistory()
    clearAllData()
    windows.hideLens()
    return { ok: true }
  })
}

export function shutdown(): void {
  liveSession.stop()
  setClipboardWatch(false)
  unregisterShortcuts()
}
