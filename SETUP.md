# LinguaLens AI — Setup & Acceptance Tests (Windows)

## Install

1. Download `LinguaLens AI Setup 1.0.0.exe` from the
   [GitHub Releases page](https://github.com/asifaliattari/lingualens-ai/releases/latest).
2. Run the installer. (Windows SmartScreen warns because v1 is unsigned — click
   **More info → Run anyway**.)
3. Launch **LinguaLens AI** from the Start menu or desktop shortcut.

## Add your translation key (required for real translation)

1. Open **Settings → AI translation provider**.
2. Get a free key: **Google Gemini** → https://aistudio.google.com (recommended, free tier),
   or use an **OpenAI** key.
3. Paste it and click **Save key**. It is encrypted with Windows DPAPI and never leaves your PC.
4. Without a key, every translation shows a setup message — the app never invents translations.

## First run

- Press **Ctrl+Shift+L** to show/hide the floating lens.
- Press **Ctrl+Shift+C**, drag a rectangle over any text on screen, review the OCR result, translate.
- Press **Ctrl+Shift+T** to translate whatever text is on your clipboard.

## Acceptance tests (the 16 checks)

Run these on a Windows 10/11 PC after installing:

1. **FR → Urdu:** paste French text in *Enter Text*, target *Urdu*. Expect natural Urdu script.
2. **DE → Simple English:** paste German text, target *Simple English*. Expect short, plain sentences.
3. **NL → Urdu:** paste Dutch text, target *Urdu*.
4. **Hard EN → Simple EN:** paste a difficult English paragraph, target *Simple English*.
5. **Lens above apps:** press `Ctrl+Shift+L` with Word/browser open — lens floats above it.
6. **Move:** drag the lens by its body (unlocked) — it follows the mouse, stays on screen.
7. **Rotate:** drag the ⟳ handle below the lens — card + text rotate together; double-click resets.
8. **Resize:** drag any corner/edge handle — lens resizes, minimum 240×160.
9. **Capture:** `Ctrl+Shift+C`, draw a rectangle over text in a PDF/browser — overlay appears, `Esc` cancels.
10. **OCR:** after capture, the recognized text appears for review with a confidence %.
11. **Lens display:** translate the captured text → translation appears inside the floating lens.
12. **Live mode:** *Live* tab → Start, select a region, change the text under it — lens updates (~2 s).
13. **Live pause:** press Pause — captures stop (counter freezes); Resume restarts; Stop ends session.
14. **Copy:** in any result, *Copy* → paste elsewhere to verify clipboard content.
15. **Persistence:** set opacity/mode/shortcuts, close the app, reopen — settings are kept.
16. **Failure handling:** remove the API key / disconnect network → clear error + *Retry*;
    deny nothing (no permission prompts needed); low-confidence OCR asks for review.

Report any failing test with the exact step number.
