# LinguaLens AI — Privacy

## What stays on your PC

- **Settings, API keys, history** — stored in `%APPDATA%\LinguaLens AI\`.
  API keys are encrypted with Windows DPAPI (`safeStorage`); they cannot be read by
  other users on the machine and are never written to logs.
- **Translation history** — a local SQLite database. Searchable, exportable (TXT/CSV),
  deletable per-item or in full. **Private session mode** disables all history writes.
- **Screenshots** — never saved by default. Captures live in memory only, unless you
  explicitly enable *Settings → Save captured screenshots*.

## What leaves your PC

- **Translation requests** — the text you translate is sent to the AI provider you
  configured (Google Gemini or OpenAI) so it can be translated. Nothing else is sent.
- **OCR** — runs 100% locally with Tesseract.js. Images are not uploaded for OCR.
- **OCR language data** — downloaded once from the Tesseract CDN (`tessdata.projectnaptha.com`
  via jsDelivr) on first use, then cached locally.

## Capture indicator

A red **“Capturing screen”** badge is always visible in the main window while any capture
or live session is active. Capture only starts when you start it (button, shortcut, or live
mode); **Pause** and **Stop** immediately halt scheduled captures and release resources.

## Clipboard

Clipboard content is read **only** when you press *Translate clipboard* / `Ctrl+Shift+T`,
or when you explicitly enable *Watch clipboard* (off by default, with an on-screen disclosure).
The app never silently harvests clipboard content.

## Clearing data

*Settings → History & privacy → Clear all local data* wipes settings, keys, history, and
stops all background activity.
