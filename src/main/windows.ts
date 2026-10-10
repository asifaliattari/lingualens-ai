import { BrowserWindow, screen, shell } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import Store from 'electron-store'

let mainWindow: BrowserWindow | null = null
let lensWindow: BrowserWindow | null = null
let overlayWindow: BrowserWindow | null = null
let settingsWindow: BrowserWindow | null = null

const lensBoundsStore = new Store<Record<string, number>>({ name: 'lens-bounds', defaults: {} })

function resolvePreload(): string {
  const candidates = [
    path.join(__dirname, '../preload/index.mjs'),
    path.join(__dirname, '../preload/index.js')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  return candidates[0]
}

function loadRoute(win: BrowserWindow, hash: string): void {
  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (devUrl) {
    void win.loadURL(`${devUrl}#/${hash}`)
  } else {
    void win.loadFile(path.join(__dirname, '../renderer/index.html'), { hash: `/${hash}` })
  }
}

function baseWebPreferences(): Electron.WebPreferences {
  return {
    preload: resolvePreload(),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true
  }
}

export function createMainWindow(): BrowserWindow {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    mainWindow.focus()
    return mainWindow
  }
  mainWindow = new BrowserWindow({
    width: 1020,
    height: 720,
    minWidth: 860,
    minHeight: 600,
    title: 'LinguaLens AI',
    autoHideMenuBar: true,
    webPreferences: baseWebPreferences()
  })
  loadRoute(mainWindow, 'main')
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })
  return mainWindow
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : null
}

function defaultLensBounds(): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  const w = 470
  const h = 340
  return {
    x: Math.round(area.x + area.width - w - 40),
    y: Math.round(area.y + area.height - h - 60),
    width: w,
    height: h
  }
}

export function createLensWindow(): BrowserWindow {
  if (lensWindow && !lensWindow.isDestroyed()) return lensWindow
  const saved = lensBoundsStore.store
  const fallback = defaultLensBounds()
  const bounds = {
    x: typeof saved.x === 'number' ? saved.x : fallback.x,
    y: typeof saved.y === 'number' ? saved.y : fallback.y,
    width: typeof saved.width === 'number' ? saved.width : fallback.width,
    height: typeof saved.height === 'number' ? saved.height : fallback.height
  }
  lensWindow = new BrowserWindow({
    ...bounds,
    minWidth: 240,
    minHeight: 160,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    focusable: true,
    webPreferences: baseWebPreferences()
  })
  // Keep above other apps, including fullscreen windows where the OS allows it.
  lensWindow.setAlwaysOnTop(true, 'screen-saver')
  lensWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  loadRoute(lensWindow, 'lens')
  let saveTimer: NodeJS.Timeout | null = null
  const persist = () => {
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      const b = lensWindow?.getBounds()
      if (b) lensBoundsStore.set({ x: b.x, y: b.y, width: b.width, height: b.height })
    }, 400)
  }
  lensWindow.on('moved', persist)
  lensWindow.on('resized', persist)
  lensWindow.on('closed', () => {
    lensWindow = null
  })
  return lensWindow
}

export function getLensWindow(): BrowserWindow | null {
  return lensWindow && !lensWindow.isDestroyed() ? lensWindow : null
}

export function showLens(): void {
  const win = createLensWindow()
  if (!win.isVisible()) win.show()
  win.focus()
}

export function hideLens(): void {
  getLensWindow()?.hide()
}

export function toggleLens(): void {
  const win = getLensWindow()
  if (win && win.isVisible()) hideLens()
  else showLens()
}

export function destroyLens(): void {
  getLensWindow()?.close()
}

export interface DisplayInfo {
  id: number
  bounds: Electron.Rectangle
  workArea: Electron.Rectangle
  scaleFactor: number
}

export function getDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map((d) => ({
    id: d.id,
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor
  }))
}

export function createOverlayWindow(): BrowserWindow {
  closeOverlayWindow()
  const displays = screen.getAllDisplays()
  const x = Math.min(...displays.map((d) => d.bounds.x))
  const y = Math.min(...displays.map((d) => d.bounds.y))
  const right = Math.max(...displays.map((d) => d.bounds.x + d.bounds.width))
  const bottom = Math.max(...displays.map((d) => d.bounds.y + d.bounds.height))
  overlayWindow = new BrowserWindow({
    x,
    y,
    width: right - x,
    height: bottom - y,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    hasShadow: false,
    enableLargerThanScreen: true,
    webPreferences: baseWebPreferences()
  })
  overlayWindow.setAlwaysOnTop(true, 'screen-saver')
  loadRoute(overlayWindow, 'overlay')
  overlayWindow.on('closed', () => {
    overlayWindow = null
  })
  return overlayWindow
}

export function getOverlayWindow(): BrowserWindow | null {
  return overlayWindow && !overlayWindow.isDestroyed() ? overlayWindow : null
}

export function closeOverlayWindow(): void {
  getOverlayWindow()?.close()
  overlayWindow = null
}

export function createSettingsWindow(): BrowserWindow {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus()
    return settingsWindow
  }
  const parent = getMainWindow()
  settingsWindow = new BrowserWindow({
    width: 680,
    height: 800,
    minWidth: 600,
    minHeight: 600,
    title: 'LinguaLens AI — Settings',
    autoHideMenuBar: true,
    parent: parent ?? undefined,
    modal: Boolean(parent),
    webPreferences: baseWebPreferences()
  })
  loadRoute(settingsWindow, 'settings')
  settingsWindow.on('closed', () => {
    settingsWindow = null
  })
  return settingsWindow
}

export function closeSettingsWindow(): void {
  settingsWindow?.close()
}
