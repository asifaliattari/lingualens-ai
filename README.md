# LinguaLens AI

A floating translation lens for the Windows desktop. Translate English, French, Dutch, and German
into **Simple English** or **Urdu (اردو)** from any app — browsers, PDFs, Word, email — using a
movable, rotatable, resizable always-on-top lens.

Built with **Electron + React + TypeScript + Tailwind CSS**, real **Tesseract.js OCR**, and
configurable **OpenAI / Google Gemini** translation. By [AstolixGen](https://astolixgen.com).

## Features

- **Floating lens** — transparent glass window, always on top; drag to move, rotation handle,
  8 resize handles, opacity slider, pin/lock, minimize/maximize, compact & expanded layouts.
- **4 display modes** — side-by-side, stacked, translation-only, compact floating card. RTL layout for Urdu.
- **Screen region capture + OCR** — draw a rectangle over any desktop text; Tesseract.js reads it
  (English, French, German, Dutch); review/edit low-confidence results before translating.
- **Live translation** — watches a region on a configurable interval, skips unchanged captures,
  re-translates only new text. Pause / resume / stop / manual refresh.
- **Type & paste translation** — debounced auto-translate, detected-language display, copy,
  retry, speak, send-to-lens.
- **Clipboard workflow** — `Ctrl+Shift+T` translates clipboard text on demand; optional
  clipboard watch (off by default, clearly disclosed).
- **Global shortcuts** — configurable, with conflict detection (`Ctrl+Shift+L/T/C/R` defaults, `Esc` cancels).
- **History** — local SQLite database (sql.js, no native modules): search, copy, reopen,
  delete, clear, export TXT/CSV, private session mode.
- **Text-to-speech** — Windows SAPI voices via PowerShell; per-language voice guidance for Urdu.
- **Secure credentials** — API keys encrypted with Windows DPAPI (`safeStorage`), stored only on
  your PC. No key is ever shipped in the app or committed to source.

## Project layout

```
src/
  main/        Electron main process (windows, IPC, capture, OCR, translation, history, TTS, shortcuts, live loop)
  preload/     contextBridge API (the only bridge between UI and Node)
  renderer/    React UI — #/main, #/lens, #/overlay, #/settings hash routes
  shared/      types, IPC channels, translation prompts
scripts/       icon generator, OCR + DB smoke tests
resources/     tray icon
```

Security: context isolation on, Node integration off, sandboxed renderers, strict CSP,
validated IPC payloads.

## Development

Requirements: Node.js 20+, Windows 10/11 for running the app (builds anywhere).

```bash
npm install        # regenerates package-lock.json (not committed: exceeds the API push size limit)
npm run dev        # hot-reload dev build
npm run build      # typecheck + production build
npm run test:ocr   # real OCR engine smoke test (Node)
npm run test:db    # SQLite history engine smoke test (Node)
npm run icon       # regenerate resources/icon.png
npm run dist       # build out/ then package the Windows installer -> dist-installer/
```

The installer is unsigned (`signAndEditExecutable: false`) so it builds on any OS without
Wine. Windows SmartScreen will show a warning for the unsigned build — expected for v1.

## API keys

Translation calls the real OpenAI / Gemini APIs. Add your key in **Settings → AI translation
provider** (free Gemini key: https://aistudio.google.com). Without a key the app shows a
setup message — it never fakes a translation.

## What was verified where

- ✅ TypeScript typecheck + production build (Linux CI)
- ✅ Real Tesseract.js OCR on a generated test image (`npm run test:ocr`)
- ✅ Real SQLite history engine (`npm run test:db`)
- ✅ Windows installer packaging (`npm run dist`, unsigned NSIS)
- ⏳ Windows-only behaviors (floating lens above other apps, `desktopCapturer`, global
  shortcuts, SAPI voices, DPAPI) are implemented with the real Electron APIs but must be
  acceptance-tested on a Windows PC — see `SETUP.md` for the 16-test checklist.

## License

MIT — © AstolixGen
