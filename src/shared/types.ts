export type SourceLang = 'auto' | 'en' | 'fr' | 'de' | 'nl'
export type TargetLang = 'simple-en' | 'ur'
export type AiProvider = 'gemini' | 'openai'
export type LensMode = 'side-by-side' | 'stacked' | 'translation-only' | 'compact'
export type LensLayout = 'expanded' | 'compact'

export const SOURCE_LANGS: { code: SourceLang; label: string }[] = [
  { code: 'auto', label: 'Auto-detect' },
  { code: 'en', label: 'English' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'nl', label: 'Dutch' }
]

export const TARGET_LANGS: { code: TargetLang; label: string }[] = [
  { code: 'simple-en', label: 'Simple English' },
  { code: 'ur', label: 'Urdu (اردو)' }
]

export interface TranslateRequest {
  text: string
  sourceLang: SourceLang
  targetLang: TargetLang
  provider?: AiProvider
  explain?: boolean
  romanUrdu?: boolean
  complex?: boolean
}

export interface TranslateResult {
  ok: boolean
  originalText: string
  translatedText?: string
  detectedLang?: Exclude<SourceLang, 'auto'>
  targetLang: TargetLang
  explanation?: string
  provider?: AiProvider
  error?: string
}

export interface LensContent {
  original: string
  translated: string
  detectedLang?: string
  targetLang: TargetLang
  status: 'idle' | 'loading' | 'ready' | 'error'
  error?: string
  updatedAt: number
}

export interface LensOptions {
  opacity: number
  mode: LensMode
  layout: LensLayout
  fontSize: number
  lineHeight: number
  rotation: number
  locked: boolean
  pinned: boolean
}

export interface OcrResult {
  ok: boolean
  text?: string
  confidence?: number
  error?: string
}

export interface CaptureRegion {
  x: number
  y: number
  width: number
  height: number
  displayId: number
}

export interface LiveStatus {
  running: boolean
  paused: boolean
  intervalMs: number
  captures: number
  lastCaptureAt?: number
  lastChangeAt?: number
  error?: string
}

export interface HistoryItem {
  id: number
  originalText: string
  translatedText: string
  sourceLang: string
  targetLang: string
  provider: string
  createdAt: string
}

export interface ShortcutDef {
  action: 'toggleLens' | 'translateClipboard' | 'captureRegion' | 'refreshLive'
  label: string
  accelerator: string
}

export interface TtsVoice {
  name: string
  lang: string
}

export interface Settings {
  sourceLang: SourceLang
  targetLang: TargetLang
  provider: AiProvider
  openaiModel: string
  openaiComplexModel: string
  geminiModel: string
  geminiComplexModel: string
  explain: boolean
  romanUrdu: boolean
  autoTranslate: boolean
  debounceMs: number
  ocrLangs: string[]
  lensOpacity: number
  lensMode: LensMode
  lensFontSize: number
  lensLineHeight: number
  captureIntervalMs: number
  shortcuts: Record<ShortcutDef['action'], string>
  speechRate: number
  speechVoice: string
  historyEnabled: boolean
  privateMode: boolean
  clipboardWatch: boolean
  saveScreenshots: boolean
  startMinimized: boolean
  startWithWindows: boolean
}

export const DEFAULT_SETTINGS: Settings = {
  sourceLang: 'auto',
  targetLang: 'simple-en',
  provider: 'gemini',
  openaiModel: 'gpt-4o-mini',
  openaiComplexModel: 'gpt-4o',
  geminiModel: 'gemini-2.0-flash',
  geminiComplexModel: 'gemini-1.5-pro',
  explain: false,
  romanUrdu: false,
  autoTranslate: true,
  debounceMs: 800,
  ocrLangs: ['eng', 'fra', 'deu', 'nld'],
  lensOpacity: 0.94,
  lensMode: 'side-by-side',
  lensFontSize: 15,
  lensLineHeight: 1.55,
  captureIntervalMs: 2000,
  shortcuts: {
    toggleLens: 'CommandOrControl+Shift+L',
    translateClipboard: 'CommandOrControl+Shift+T',
    captureRegion: 'CommandOrControl+Shift+C',
    refreshLive: 'CommandOrControl+Shift+R'
  },
  speechRate: 1,
  speechVoice: '',
  historyEnabled: true,
  privateMode: false,
  clipboardWatch: false,
  saveScreenshots: false,
  startMinimized: false,
  startWithWindows: false
}

export const SHORTCUT_LABELS: Record<ShortcutDef['action'], string> = {
  toggleLens: 'Show / hide floating lens',
  translateClipboard: 'Translate clipboard text',
  captureRegion: 'Capture a screen region',
  refreshLive: 'Refresh live translation'
}
