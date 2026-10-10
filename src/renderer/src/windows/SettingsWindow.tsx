import { useEffect, useState } from 'react'
import { SOURCE_LANGS, TARGET_LANGS, SHORTCUT_LABELS } from '@shared/types'
import type { AiProvider, Settings, ShortcutDef, TtsVoice } from '@shared/types'
import { Btn, Select, Field, Toggle, Card, SectionTitle, ErrorNote } from '../components/ui'

const api = () => window.lingualens

const OCR_LANG_OPTIONS = [
  { code: 'eng', label: 'English' },
  { code: 'fra', label: 'French' },
  { code: 'deu', label: 'German' },
  { code: 'nld', label: 'Dutch' }
]

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-3">{children}</div>
}

export default function SettingsWindow() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [keyStatus, setKeyStatus] = useState<Record<string, boolean>>({})
  const [keyMsg, setKeyMsg] = useState<string>()
  const [shortcuts, setShortcuts] = useState<Record<ShortcutDef['action'], string> | null>(null)
  const [shortcutErrors, setShortcutErrors] = useState<Record<string, string>>({})
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [voicesError, setVoicesError] = useState<string>()
  const [version, setVersion] = useState('')
  const [savedTick, setSavedTick] = useState(false)

  const refresh = async () => {
    const s = await api().getSettings()
    setSettings(s)
    const sc = await api().getShortcuts()
    setShortcuts(sc.shortcuts)
    const errs: Record<string, string> = {}
    for (const r of sc.results) {
      if (!r.ok && r.error) errs[r.action] = r.error
    }
    setShortcutErrors(errs)
    const [g, o] = await Promise.all([api().hasApiKey('gemini'), api().hasApiKey('openai')])
    setKeyStatus({ gemini: g, openai: o })
    setVersion(await api().getVersion().catch(() => ''))
  }

  useEffect(() => {
    void refresh()
    api()
      .ttsVoices()
      .then((r) => {
        if (r.ok && r.voices) setVoices(r.voices)
        else setVoicesError(r.error)
      })
      .catch(() => setVoicesError('Could not load voices.'))
  }, [])

  const update = async (partial: Partial<Settings>) => {
    const next = await api().saveSettings(partial)
    setSettings(next)
    setSavedTick(true)
    setTimeout(() => setSavedTick(false), 1200)
  }

  const saveKey = async () => {
    if (!settings) return
    setKeyMsg(undefined)
    try {
      await api().setApiKey(settings.provider, keyInput)
      setKeyInput('')
      setKeyStatus((k) => ({ ...k, [settings.provider]: true }))
      setKeyMsg('Key saved securely on this PC.')
    } catch (e) {
      setKeyMsg(e instanceof Error ? e.message : 'Could not save key.')
    }
  }

  const clearKey = async (provider: AiProvider) => {
    await api().clearApiKey(provider)
    setKeyStatus((k) => ({ ...k, [provider]: false }))
  }

  const saveShortcut = async (action: ShortcutDef['action']) => {
    if (!shortcuts) return
    try {
      const r = await api().setShortcut(action, shortcuts[action])
      const errs: Record<string, string> = {}
      for (const res of r.results) {
        if (!res.ok && res.error) errs[res.action] = res.error
      }
      setShortcutErrors(errs)
    } catch (e) {
      setShortcutErrors((p) => ({ ...p, [action]: e instanceof Error ? e.message : 'Invalid shortcut.' }))
    }
  }

  if (!settings || !shortcuts) {
    return <div className="p-6 text-sm text-slate-500">Loading settings…</div>
  }

  const providerLabel = settings.provider === 'gemini' ? 'Google Gemini' : 'OpenAI'

  return (
    <div className="h-full overflow-y-auto bg-slate-50 text-slate-900">
      <header className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between z-10">
        <h1 className="font-semibold">LinguaLens AI — Settings</h1>
        <div className="flex items-center gap-3">
          {savedTick && <span className="text-xs text-green-700">Saved ✓</span>}
          <Btn variant="ghost" onClick={() => window.close()}>
            Close
          </Btn>
        </div>
      </header>

      <div className="p-5 flex flex-col gap-4 max-w-2xl">
        <Card>
          <SectionTitle>Languages</SectionTitle>
          <Row>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Default source language">
                <Select
                  value={settings.sourceLang}
                  onChange={(v) => void update({ sourceLang: v as Settings['sourceLang'] })}
                  options={SOURCE_LANGS.map((l) => ({ value: l.code, label: l.label }))}
                />
              </Field>
              <Field label="Default target language">
                <Select
                  value={settings.targetLang}
                  onChange={(v) => void update({ targetLang: v as Settings['targetLang'] })}
                  options={TARGET_LANGS.map((l) => ({ value: l.code, label: l.label }))}
                />
              </Field>
            </div>
            <p className="text-xs text-slate-500">
              Auto-detect identifies English, French, Dutch, and German offline before translating.
            </p>
          </Row>
        </Card>

        <Card>
          <SectionTitle>AI translation provider</SectionTitle>
          <Row>
            <div className="flex gap-4 text-sm">
              {(['gemini', 'openai'] as AiProvider[]).map((p) => (
                <label key={p} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={settings.provider === p}
                    onChange={() => void update({ provider: p })}
                    className="accent-blue-600"
                  />
                  <span className="font-medium">{p === 'gemini' ? 'Google Gemini' : 'OpenAI'}</span>
                  {keyStatus[p] ? (
                    <span className="text-xs text-green-700">key saved</span>
                  ) : (
                    <span className="text-xs text-amber-700">no key</span>
                  )}
                </label>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label={settings.provider === 'gemini' ? 'Fast model' : 'Fast model'}>
                <input
                  type="text"
                  value={settings.provider === 'gemini' ? settings.geminiModel : settings.openaiModel}
                  onChange={(e) =>
                    void update(
                      settings.provider === 'gemini' ? { geminiModel: e.target.value } : { openaiModel: e.target.value }
                    )
                  }
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </Field>
              <Field label="Model for long / complex text">
                <input
                  type="text"
                  value={settings.provider === 'gemini' ? settings.geminiComplexModel : settings.openaiComplexModel}
                  onChange={(e) =>
                    void update(
                      settings.provider === 'gemini'
                        ? { geminiComplexModel: e.target.value }
                        : { openaiComplexModel: e.target.value }
                    )
                  }
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
              </Field>
            </div>
            <Field label={`${providerLabel} API key`}>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={keyInput}
                  onChange={(e) => setKeyInput(e.target.value)}
                  placeholder={keyStatus[settings.provider] ? '•••••••• (saved)' : 'Paste your API key'}
                  className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
                />
                <Btn variant="primary" onClick={() => void saveKey()} disabled={keyInput.trim().length < 8}>
                  Save key
                </Btn>
                {keyStatus[settings.provider] && (
                  <Btn variant="ghost" onClick={() => void clearKey(settings.provider)}>
                    Remove
                  </Btn>
                )}
              </div>
            </Field>
            <p className="text-xs text-slate-500">
              Keys are encrypted with Windows DPAPI and stored only on this PC — never in code, never uploaded.
              Get a free Gemini key at{' '}
              <a href="https://aistudio.google.com" target="_blank" rel="noreferrer" className="text-blue-600 underline">
                aistudio.google.com
              </a>
              . Without a key, translation shows a setup message instead of a fake result.
            </p>
            <ErrorNote message={keyMsg} />
          </Row>
        </Card>

        <Card>
          <SectionTitle>Translation options</SectionTitle>
          <Row>
            <Toggle checked={settings.explain} onChange={(v) => void update({ explain: v })} label="Explain difficult ideas" hint="Adds a short plain-language explanation after the translation." />
            <Toggle checked={settings.romanUrdu} onChange={(v) => void update({ romanUrdu: v })} label="Roman Urdu explanation" hint="Also include the Urdu translation in Roman script." />
            <Toggle checked={settings.autoTranslate} onChange={(v) => void update({ autoTranslate: v })} label="Auto-translate while typing" hint="Translates shortly after you stop typing." />
            <Field label="Auto-translate delay (ms)">
              <input
                type="number" min={300} max={5000} step={100} value={settings.debounceMs}
                onChange={(e) => void update({ debounceMs: Math.max(300, Math.min(5000, Number(e.target.value) || 800)) })}
                className="w-32 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              />
            </Field>
          </Row>
        </Card>

        <Card>
          <SectionTitle>OCR languages</SectionTitle>
          <p className="text-xs text-slate-500 mb-2">Downloaded on first use and cached on this PC.</p>
          <div className="flex flex-wrap gap-4">
            {OCR_LANG_OPTIONS.map((o) => (
              <label key={o.code} className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.ocrLangs.includes(o.code)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...settings.ocrLangs, o.code]
                      : settings.ocrLangs.filter((c) => c !== o.code)
                    if (next.length > 0) void update({ ocrLangs: next })
                  }}
                  className="accent-blue-600"
                />
                {o.label}
              </label>
            ))}
          </div>
        </Card>

        <Card>
          <SectionTitle>Floating lens</SectionTitle>
          <Row>
            <Field label={`Opacity (${Math.round(settings.lensOpacity * 100)}%)`}>
              <input type="range" min={30} max={100} value={Math.round(settings.lensOpacity * 100)}
                onChange={(e) => void update({ lensOpacity: Number(e.target.value) / 100 })} className="w-full" />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Default display mode">
                <Select value={settings.lensMode}
                  onChange={(v) => void update({ lensMode: v as Settings['lensMode'] })}
                  options={[
                    { value: 'side-by-side', label: 'Side-by-side' },
                    { value: 'stacked', label: 'Stacked' },
                    { value: 'translation-only', label: 'Translation only' },
                    { value: 'compact', label: 'Compact card' }
                  ]} />
              </Field>
              <Field label="Font size">
                <input type="number" min={10} max={28} value={settings.lensFontSize}
                  onChange={(e) => void update({ lensFontSize: Math.max(10, Math.min(28, Number(e.target.value) || 15)) })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </Field>
              <Field label="Line height">
                <input type="number" min={1} max={2.5} step={0.05} value={settings.lensLineHeight}
                  onChange={(e) => void update({ lensLineHeight: Math.max(1, Math.min(2.5, Number(e.target.value) || 1.55)) })}
                  className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
              </Field>
            </div>
          </Row>
        </Card>

        <Card>
          <SectionTitle>Live translation</SectionTitle>
          <Field label="Capture interval (milliseconds)">
            <input type="number" min={500} max={30000} step={500} value={settings.captureIntervalMs}
              onChange={(e) => void update({ captureIntervalMs: Math.max(500, Math.min(30000, Number(e.target.value) || 2000)) })}
              className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
          </Field>
          <p className="text-xs text-slate-500 mt-2">Default 2000 ms. Unchanged regions are skipped automatically.</p>
        </Card>

        <Card>
          <SectionTitle>Keyboard shortcuts</SectionTitle>
          <Row>
            {(Object.keys(SHORTCUT_LABELS) as ShortcutDef['action'][]).map((action) => (
              <div key={action}>
                <Field label={SHORTCUT_LABELS[action]}>
                  <div className="flex gap-2">
                    <input type="text" value={shortcuts[action]}
                      onChange={(e) => setShortcuts((s) => (s ? { ...s, [action]: e.target.value } : s))}
                      placeholder="e.g. Control+Shift+L"
                      className="flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm font-mono" />
                    <Btn variant="ghost" onClick={() => void saveShortcut(action)}>Apply</Btn>
                  </div>
                </Field>
                <ErrorNote message={shortcutErrors[action]} />
              </div>
            ))}
            <p className="text-xs text-slate-500">
              If Windows or another app already uses a combination, registration fails and the conflict is shown here.
            </p>
          </Row>
        </Card>

        <Card>
          <SectionTitle>Speech</SectionTitle>
          <Row>
            <Field label="Voice">
              <Select value={settings.speechVoice}
                onChange={(v) => void update({ speechVoice: v })}
                options={[{ value: '', label: 'System default' }].concat(
                  voices.map((v) => ({ value: v.name, label: `${v.name} (${v.lang})` }))
                )} />
            </Field>
            <Field label={`Speaking rate (${settings.speechRate.toFixed(1)}×)`}>
              <input type="range" min={0.5} max={2} step={0.1} value={settings.speechRate}
                onChange={(e) => void update({ speechRate: Number(e.target.value) })} className="w-full" />
            </Field>
            <div className="flex gap-2">
              <Btn variant="ghost" onClick={() => void api().ttsSpeak('This is LinguaLens AI.', 'en')}>
                Test voice
              </Btn>
              <Btn variant="ghost" onClick={() => void api().ttsStop()}>
                Stop
              </Btn>
            </div>
            <ErrorNote message={voicesError} />
            <p className="text-xs text-slate-500">
              Uses Windows system voices. For Urdu, install an Urdu voice in Windows Settings → Time & language →
              Speech; if none is installed the system default is used and a notice is shown.
            </p>
          </Row>
        </Card>

        <Card>
          <SectionTitle>History & privacy</SectionTitle>
          <Row>
            <Toggle checked={settings.historyEnabled} onChange={(v) => void update({ historyEnabled: v })}
              label="Keep translation history" hint="Local SQLite database on this PC." />
            <Toggle checked={settings.privateMode} onChange={(v) => void update({ privateMode: v })}
              label="Private session mode" hint="Nothing is written to history while on." />
            <Toggle checked={settings.saveScreenshots} onChange={(v) => void update({ saveScreenshots: v })}
              label="Save captured screenshots" hint="Off by default. Captures are otherwise processed in memory only." />
            <Toggle checked={settings.clipboardWatch} onChange={(v) => void update({ clipboardWatch: v })}
              label="Watch clipboard for new text"
              hint="Off by default. When on, copying new text auto-translates it (sends the text to your AI provider)." />
            <div>
              <Btn variant="danger" onClick={async () => {
                if (window.confirm('Delete ALL LinguaLens data on this PC (settings, keys, history)?')) {
                  await api().clearAllData()
                  await refresh()
                }
              }}>
                Clear all local data
              </Btn>
            </div>
          </Row>
        </Card>

        <Card>
          <SectionTitle>Startup</SectionTitle>
          <Row>
            <Toggle checked={settings.startMinimized} onChange={(v) => void update({ startMinimized: v })}
              label="Start minimized" hint="Launch to the system tray without opening the main window." />
            <Toggle checked={settings.startWithWindows} onChange={(v) => void update({ startWithWindows: v })}
              label="Start with Windows" hint="Off by default." />
          </Row>
        </Card>

        <Card>
          <SectionTitle>About</SectionTitle>
          <p className="text-sm text-slate-600">LinguaLens AI version {version || '1.0.0'}</p>
          <p className="text-xs text-slate-500 mt-1">
            A Windows desktop app by AstolixGen. Updates are published as new installers on the GitHub releases page.
          </p>
        </Card>
      </div>
    </div>
  )
}
