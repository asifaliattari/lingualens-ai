import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC } from '../shared/channels'
import type {
  AiProvider,
  CaptureRegion,
  HistoryItem,
  LensContent,
  LensOptions,
  LiveStatus,
  OcrResult,
  Settings,
  ShortcutDef,
  TranslateRequest,
  TranslateResult,
  TtsVoice
} from '../shared/types'

function on<T>(channel: string, cb: (payload: T) => void): () => void {
  const listener = (_e: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

const api = {
  translate: (req: TranslateRequest): Promise<TranslateResult> => ipcRenderer.invoke(IPC.translate, req),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (partial: Partial<Settings>): Promise<Settings> => ipcRenderer.invoke(IPC.saveSettings, partial),
  setApiKey: (provider: AiProvider, key: string): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.setApiKey, provider, key),
  hasApiKey: (provider: AiProvider): Promise<boolean> => ipcRenderer.invoke(IPC.hasApiKey, provider),
  clearApiKey: (provider: AiProvider): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.clearApiKey, provider),

  lensShow: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.lensShow),
  lensHide: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.lensHide),
  lensToggle: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.lensToggle),
  lensSetContent: (content: LensContent): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.lensSetContent, content),
  lensSetOptions: (options: Partial<LensOptions>): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.lensSetOptions, options),
  lensSetBounds: (bounds: Partial<Electron.Rectangle>): Promise<{ ok: boolean; bounds?: Electron.Rectangle }> =>
    ipcRenderer.invoke(IPC.lensSetBounds, bounds),
  lensGetBounds: (): Promise<Electron.Rectangle | null> => ipcRenderer.invoke(IPC.lensGetBounds),
  lensSetPinned: (pinned: boolean): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.lensSetPinned, pinned),

  openSettings: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.openSettings),

  captureRegion: (): Promise<
    | { cancelled: true }
    | { cancelled: false; region: CaptureRegion; text: string; confidence: number; error?: string }
  > => ipcRenderer.invoke(IPC.captureRegion),
  ocrDataUrl: (dataUrl: string): Promise<OcrResult> => ipcRenderer.invoke(IPC.ocrDataUrl, dataUrl),
  overlayDone: (region: CaptureRegion | null): void => ipcRenderer.send(IPC.overlayResult, region),

  liveStart: (): Promise<{ ok: boolean; cancelled?: boolean; region?: CaptureRegion }> =>
    ipcRenderer.invoke(IPC.liveStart),
  livePause: (): Promise<LiveStatus> => ipcRenderer.invoke(IPC.livePause),
  liveResume: (): Promise<LiveStatus> => ipcRenderer.invoke(IPC.liveResume),
  liveStop: (): Promise<LiveStatus> => ipcRenderer.invoke(IPC.liveStop),
  liveRefresh: (): Promise<LiveStatus> => ipcRenderer.invoke(IPC.liveRefresh),
  liveStatus: (): Promise<LiveStatus> => ipcRenderer.invoke(IPC.liveStatus),

  translateClipboard: (): Promise<void> => ipcRenderer.invoke(IPC.translateClipboard),
  setClipboardWatch: (enabled: boolean): Promise<{ ok: boolean }> =>
    ipcRenderer.invoke(IPC.setClipboardWatch, enabled),

  historyList: (query: string, limit: number): Promise<HistoryItem[]> =>
    ipcRenderer.invoke(IPC.historyList, query, limit),
  historyDelete: (id: number): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.historyDelete, id),
  historyClear: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.historyClear),
  historyExport: (format: 'txt' | 'csv'): Promise<{ ok: boolean; path?: string; count?: number }> =>
    ipcRenderer.invoke(IPC.historyExport, format),

  getShortcuts: (): Promise<{
    shortcuts: Record<ShortcutDef['action'], string>
    results: { action: ShortcutDef['action']; ok: boolean; error?: string }[]
  }> => ipcRenderer.invoke(IPC.getShortcuts),
  setShortcut: (
    action: ShortcutDef['action'],
    accelerator: string
  ): Promise<{ ok: boolean; results: { action: ShortcutDef['action']; ok: boolean; error?: string }[] }> =>
    ipcRenderer.invoke(IPC.setShortcut, action, accelerator),

  ttsSpeak: (text: string, lang: string): Promise<{ ok: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC.ttsSpeak, text, lang),
  ttsStop: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.ttsStop),
  ttsVoices: (): Promise<{ ok: boolean; voices?: TtsVoice[]; error?: string }> =>
    ipcRenderer.invoke(IPC.ttsVoices),

  getDisplays: (): Promise<{ id: number; bounds: Electron.Rectangle; workArea: Electron.Rectangle; scaleFactor: number }[]> =>
    ipcRenderer.invoke(IPC.getDisplays),
  getVersion: (): Promise<string> => ipcRenderer.invoke(IPC.getVersion),
  clearAllData: (): Promise<{ ok: boolean }> => ipcRenderer.invoke(IPC.clearAllData),

  onLensContent: (cb: (c: LensContent) => void) => on<LensContent>(IPC.lensContent, cb),
  onLensOptions: (cb: (o: Partial<LensOptions>) => void) => on<Partial<LensOptions>>(IPC.lensOptions, cb),
  onLiveStatus: (cb: (s: LiveStatus) => void) => on<LiveStatus>(IPC.liveStatusEvent, cb),
  onCaptureIndicator: (cb: (p: { active: boolean }) => void) => on<{ active: boolean }>(IPC.captureIndicator, cb)
}

contextBridge.exposeInMainWorld('lingualens', api)

export type LinguaLensApi = typeof api
