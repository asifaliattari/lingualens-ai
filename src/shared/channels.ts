export const IPC = {
  translate: 'll:translate',
  getSettings: 'll:get-settings',
  saveSettings: 'll:save-settings',
  setApiKey: 'll:set-api-key',
  hasApiKey: 'll:has-api-key',
  clearApiKey: 'll:clear-api-key',
  lensShow: 'll:lens-show',
  lensHide: 'll:lens-hide',
  lensToggle: 'll:lens-toggle',
  lensContent: 'll:lens-content', // main -> lens window event
  lensSetContent: 'll:lens-set-content',
  lensOptions: 'll:lens-options', // main -> lens window event
  lensSetOptions: 'll:lens-set-options',
  lensBounds: 'll:lens-bounds', // main -> lens window event
  lensSetBounds: 'll:lens-set-bounds',
  lensGetBounds: 'll:lens-get-bounds',
  lensSetPinned: 'll:lens-set-pinned',
  openSettings: 'll:open-settings',
  captureRegion: 'll:capture-region',
  ocrDataUrl: 'll:ocr-data-url',
  liveStart: 'll:live-start',
  livePause: 'll:live-pause',
  liveResume: 'll:live-resume',
  liveStop: 'll:live-stop',
  liveRefresh: 'll:live-refresh',
  liveStatus: 'll:live-status',
  liveStatusEvent: 'll:live-status-event', // main -> renderer event
  overlayResult: 'll:overlay-result', // overlay -> main internal
  captureIndicator: 'll:capture-indicator', // main -> renderer event
  translateClipboard: 'll:translate-clipboard',
  setClipboardWatch: 'll:set-clipboard-watch',
  historyList: 'll:history-list',
  historyDelete: 'll:history-delete',
  historyClear: 'll:history-clear',
  historyExport: 'll:history-export',
  getShortcuts: 'll:get-shortcuts',
  setShortcut: 'll:set-shortcut',
  ttsSpeak: 'll:tts-speak',
  ttsStop: 'll:tts-stop',
  ttsVoices: 'll:tts-voices',
  getVersion: 'll:get-version',
  getDisplays: 'll:get-displays',
  clearAllData: 'll:clear-all-data'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
