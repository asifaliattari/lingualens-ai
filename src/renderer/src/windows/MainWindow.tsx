import { useCallback, useEffect, useRef, useState } from 'react'
import { SOURCE_LANGS, TARGET_LANGS, DEFAULT_SETTINGS } from '@shared/types'
import type {
  HistoryItem,
  LensContent,
  LiveStatus,
  Settings,
  SourceLang,
  TargetLang,
  TranslateResult
} from '@shared/types'
import { Btn, Select, Field, Toggle, Card, Spinner, SectionTitle, ErrorNote } from '../components/ui'

const api = () => window.lingualens

function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  useEffect(() => {
    api()
      .getSettings()
      .then(setSettings)
      .catch(() => {})
  }, [])
  const update = useCallback(async (partial: Partial<Settings>) => {
    const next = await api().saveSettings(partial)
    setSettings(next)
    return next
  }, [])
  return { settings, update, setSettings }
}

function langLabel(code: string): string {
  return SOURCE_LANGS.find((l) => l.code === code)?.label ?? code
}

function ResultPanel({
  result,
  onRetry,
  onSendToLens,
  busy
}: {
  result: TranslateResult | null
  onRetry: () => void
  onSendToLens: () => void
  busy: boolean
}) {
  const [copied, setCopied] = useState(false)
  const [speaking, setSpeaking] = useState(false)
  const [speakError, setSpeakError] = useState<string>()
  if (!result) return null
  const copy = async () => {
    if (result.translatedText) {
      await navigator.clipboard.writeText(result.translatedText)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    }
  }
  const speak = async (text: string, lang: string) => {
    setSpeaking(true)
    setSpeakError(undefined)
    try {
      await api().ttsStop()
      const r = await api().ttsSpeak(text, lang)
      if (!r.ok) setSpeakError(r.error)
    } catch (e) {
      setSpeakError(e instanceof Error ? e.message : 'Speech failed.')
    } finally {
      setSpeaking(false)
    }
  }
  return (
    <Card className="mt-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-slate-500">
          {result.detectedLang ? `Detected: ${langLabel(result.detectedLang)}  •  ` : ''}
          Target: {result.targetLang === 'ur' ? 'Urdu' : 'Simple English'}
          {result.provider ? `  •  via ${result.provider === 'gemini' ? 'Gemini' : 'OpenAI'}` : ''}
        </div>
        <div className="flex gap-2">
          <Btn variant="ghost" onClick={copy} disabled={!result.translatedText}>
            {copied ? 'Copied!' : 'Copy'}
          </Btn>
          <Btn
            variant="ghost"
            onClick={() => result.translatedText && speak(result.translatedText, result.targetLang)}
            disabled={!result.translatedText || speaking}
          >
            {speaking ? 'Speaking…' : 'Speak translation'}
          </Btn>
          <Btn variant="ghost" onClick={() => result.originalText && speak(result.originalText, result.detectedLang ?? 'en')}>
            Speak original
          </Btn>
          <Btn variant="ghost" onClick={onRetry} disabled={busy}>
            Retry
          </Btn>
          <Btn onClick={onSendToLens} disabled={!result.translatedText}>
            Show in lens
          </Btn>
        </div>
      </div>
      {busy && (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-4">
          <Spinner /> Translating…
        </div>
      )}
      {result.ok && result.translatedText && (
        <p className={`whitespace-pre-wrap text-slate-900 ${result.targetLang === 'ur' ? 'urdu-text text-lg' : ''}`}>
          {result.translatedText}
        </p>
      )}
      {result.explanation && (
        <div className="mt-3 pt-3 border-t border-slate-100">
          <div className="text-xs font-semibold text-slate-500 mb-1">Explanation</div>
          <p className="text-sm text-slate-700 whitespace-pre-wrap">{result.explanation}</p>
        </div>
      )}
      <ErrorNote message={result.ok ? undefined : result.error} />
      <ErrorNote message={speakError} />
    </Card>
  )
}

function TranslateTab({ settings }: { settings: Settings }) {
  const [text, setText] = useState('')
  const [sourceLang, setSourceLang] = useState<SourceLang>(settings.sourceLang)
  const [targetLang, setTargetLang] = useState<TargetLang>(settings.targetLang)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [busy, setBusy] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    setSourceLang(settings.sourceLang)
    setTargetLang(settings.targetLang)
  }, [settings.sourceLang, settings.targetLang])

  const doTranslate = useCallback(
    async (input: string) => {
      const clean = input.trim()
      if (!clean) return
      setBusy(true)
      try {
        const r = await api().translate({
          text: clean,
          sourceLang,
          targetLang,
          explain: settings.explain,
          romanUrdu: settings.romanUrdu
        })
        setResult(r)
      } finally {
        setBusy(false)
      }
    },
    [sourceLang, targetLang, settings.explain, settings.romanUrdu]
  )

  useEffect(() => {
    if (!settings.autoTranslate) return
    if (timer.current) window.clearTimeout(timer.current)
    const clean = text.trim()
    if (clean.length < 3) return
    timer.current = window.setTimeout(() => void doTranslate(clean), settings.debounceMs)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [text, settings.autoTranslate, settings.debounceMs, doTranslate])

  const sendToLens = () => {
    if (!result?.translatedText) return
    const content: LensContent = {
      original: result.originalText,
      translated: result.translatedText,
      detectedLang: result.detectedLang,
      targetLang: result.targetLang,
      status: 'ready',
      updatedAt: Date.now()
    }
    void api().lensSetContent(content)
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <Field label="Source language">
          <Select
            value={sourceLang}
            onChange={(v) => setSourceLang(v as SourceLang)}
            options={SOURCE_LANGS.map((l) => ({ value: l.code, label: l.label }))}
          />
        </Field>
        <Field label="Target language">
          <Select
            value={targetLang}
            onChange={(v) => setTargetLang(v as TargetLang)}
            options={TARGET_LANGS.map((l) => ({ value: l.code, label: l.label }))}
          />
        </Field>
      </div>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Type or paste text here — English, French, Dutch, or German…"
        rows={6}
        className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <div className="flex items-center gap-3 mt-3">
        <Btn variant="primary" onClick={() => void doTranslate(text)} disabled={busy || !text.trim()}>
          {busy ? 'Translating…' : 'Translate'}
        </Btn>
        <Btn
          variant="ghost"
          onClick={async () => {
            await api().translateClipboard()
          }}
        >
          Translate clipboard text
        </Btn>
        {settings.autoTranslate && <span className="text-xs text-slate-500">Auto-translate is on</span>}
      </div>
      <ResultPanel result={result} busy={busy} onRetry={() => void doTranslate(text)} onSendToLens={sendToLens} />
    </div>
  )
}

function CaptureTab({ settings }: { settings: Settings }) {
  const [ocrText, setOcrText] = useState('')
  const [confidence, setConfidence] = useState<number | null>(null)
  const [result, setResult] = useState<TranslateResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  const capture = async () => {
    setError(undefined)
    setBusy(true)
    try {
      const r = await api().captureRegion()
      if (r.cancelled) return
      if (r.error || !r.text) {
        setError(r.error ?? 'No text recognized.')
        setOcrText('')
        setConfidence(null)
        return
      }
      setOcrText(r.text)
      setConfidence(r.confidence)
      if (r.confidence < 60) {
        setError(`Low OCR confidence (${Math.round(r.confidence)}%). Please review and edit the text below before translating.`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Capture failed.')
    } finally {
      setBusy(false)
    }
  }

  const translateOcr = async () => {
    const clean = ocrText.trim()
    if (!clean) return
    setBusy(true)
    setError(undefined)
    try {
      const r = await api().translate({
        text: clean,
        sourceLang: settings.sourceLang,
        targetLang: settings.targetLang,
        explain: settings.explain,
        romanUrdu: settings.romanUrdu
      })
      setResult(r)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Card className="mb-3">
        <p className="text-sm text-slate-600 mb-3">
          Draw a rectangle around any text on your screen — a web page, PDF, Word document, or email — and
          LinguaLens will read it with OCR and translate it.
        </p>
        <div className="flex gap-2">
          <Btn variant="primary" onClick={() => void capture()} disabled={busy}>
            {busy ? 'Working…' : 'Capture Screen Region'}
          </Btn>
          {ocrText && (
            <Btn variant="ghost" onClick={() => void capture()} disabled={busy}>
              Capture another region
            </Btn>
          )}
        </div>
        <ErrorNote message={error} />
      </Card>
      {ocrText && (
        <Card className="mb-3">
          <SectionTitle>Recognized text {confidence !== null && `(confidence ${Math.round(confidence)}%)`}</SectionTitle>
          <textarea
            value={ocrText}
            onChange={(e) => setOcrText(e.target.value)}
            rows={5}
            className="w-full rounded-xl border border-slate-300 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-3">
            <Btn variant="primary" onClick={() => void translateOcr()} disabled={busy || !ocrText.trim()}>
              {busy ? 'Translating…' : 'Translate'}
            </Btn>
          </div>
        </Card>
      )}
      <ResultPanel
        result={result}
        busy={busy}
        onRetry={() => void translateOcr()}
        onSendToLens={() => {
          if (!result?.translatedText) return
          void api().lensSetContent({
            original: result.originalText,
            translated: result.translatedText,
            detectedLang: result.detectedLang,
            targetLang: result.targetLang,
            status: 'ready',
            updatedAt: Date.now()
          })
        }}
      />
    </div>
  )
}

function LiveTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<Settings> }) {
  const [status, setStatus] = useState<LiveStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()

  useEffect(() => {
    api()
      .liveStatus()
      .then(setStatus)
      .catch(() => {})
    return api().onLiveStatus(setStatus)
  }, [])

  const start = async () => {
    setError(undefined)
    setBusy(true)
    try {
      const r = await api().liveStart()
      if (!r.ok) {
        if (!r.cancelled) setError('Could not start live translation.')
        return
      }
      setStatus(await api().liveStatus())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <Card className="mb-3">
        <p className="text-sm text-slate-600 mb-3">
          Pick a region of your screen to watch. LinguaLens re-captures it on an interval, and whenever the
          text changes it re-translates automatically inside the floating lens.
        </p>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          {!status?.running && (
            <Btn variant="primary" onClick={() => void start()} disabled={busy}>
              {busy ? 'Starting…' : 'Start Live Translation'}
            </Btn>
          )}
          {status?.running && !status.paused && <Btn onClick={() => api().livePause().then(setStatus)}>Pause</Btn>}
          {status?.running && status.paused && <Btn onClick={() => api().liveResume().then(setStatus)}>Resume</Btn>}
          {status?.running && <Btn onClick={() => api().liveRefresh().then(setStatus)}>Refresh now</Btn>}
          {status?.running && (
            <Btn variant="danger" onClick={() => api().liveStop().then(setStatus)}>
              Stop
            </Btn>
          )}
        </div>
        <Field label="Capture interval (milliseconds)">
          <input
            type="number"
            min={500}
            max={30000}
            step={500}
            value={settings.captureIntervalMs}
            onChange={(e) => {
              const v = Math.max(500, Math.min(30000, Number(e.target.value) || 2000))
              void update({ captureIntervalMs: v })
            }}
            className="w-40 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          />
        </Field>
        <ErrorNote message={error} />
      </Card>
      {status && (
        <Card>
          <SectionTitle>Live status</SectionTitle>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="text-slate-500">State</div>
            <div className="font-medium">
              {!status.running ? 'Stopped' : status.paused ? 'Paused' : 'Running'}
            </div>
            <div className="text-slate-500">Captures</div>
            <div className="font-medium">{status.captures}</div>
            <div className="text-slate-500">Last capture</div>
            <div className="font-medium">
              {status.lastCaptureAt ? new Date(status.lastCaptureAt).toLocaleTimeString() : '—'}
            </div>
            <div className="text-slate-500">Last change</div>
            <div className="font-medium">
              {status.lastChangeAt ? new Date(status.lastChangeAt).toLocaleTimeString() : '—'}
            </div>
          </div>
          <ErrorNote message={status.error} />
        </Card>
      )}
    </div>
  )
}

function HistoryTab({ settings, update }: { settings: Settings; update: (p: Partial<Settings>) => Promise<Settings> }) {
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<HistoryItem[]>([])
  const [notice, setNotice] = useState<string>()

  const reload = useCallback(async () => {
    try {
      setItems(await api().historyList(query, 200))
    } catch {
      setItems([])
    }
  }, [query])

  useEffect(() => {
    const t = window.setTimeout(() => void reload(), 250)
    return () => window.clearTimeout(t)
  }, [reload])

  const exportHistory = async (format: 'txt' | 'csv') => {
    try {
      const r = await api().historyExport(format)
      setNotice(r.ok ? `Exported ${r.count} entries to ${r.path}` : 'Export failed.')
    } catch {
      setNotice('Export failed.')
    }
    setTimeout(() => setNotice(undefined), 5000)
  }

  const reopen = (item: HistoryItem) => {
    void api().lensSetContent({
      original: item.originalText,
      translated: item.translatedText,
      detectedLang: item.sourceLang,
      targetLang: item.targetLang as TargetLang,
      status: 'ready',
      updatedAt: Date.now()
    })
  }

  return (
    <div>
      <Card className="mb-3">
        <div className="flex flex-col gap-3">
          <Toggle
            checked={settings.historyEnabled}
            onChange={(v) => void update({ historyEnabled: v })}
            label="Keep translation history"
            hint="Stored only on this PC in a local database."
          />
          <Toggle
            checked={settings.privateMode}
            onChange={(v) => void update({ privateMode: v })}
            label="Private session mode"
            hint="When on, nothing is written to history."
          />
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search history…"
              className="flex-1 min-w-40 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
            />
            <Btn variant="ghost" onClick={() => void exportHistory('txt')}>
              Export TXT
            </Btn>
            <Btn variant="ghost" onClick={() => void exportHistory('csv')}>
              Export CSV
            </Btn>
            <Btn
              variant="danger"
              onClick={() => {
                if (window.confirm('Delete all translation history?')) void api().historyClear().then(() => void reload())
              }}
            >
              Clear all
            </Btn>
          </div>
          {notice && <div className="text-xs text-slate-600">{notice}</div>}
        </div>
      </Card>
      <div className="flex flex-col gap-2">
        {items.length === 0 && <p className="text-sm text-slate-500">No history yet.</p>}
        {items.map((item) => (
          <Card key={item.id} className="!p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm text-slate-800 truncate">{item.originalText}</p>
                <p className={`text-sm text-slate-500 truncate ${item.targetLang === 'ur' ? 'urdu-text' : ''}`}>
                  {item.translatedText}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  {langLabel(item.sourceLang)} → {item.targetLang === 'ur' ? 'Urdu' : 'Simple English'} •{' '}
                  {new Date(item.createdAt).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-1 shrink-0">
                <Btn
                  variant="ghost"
                  className="!px-2"
                  onClick={() => void navigator.clipboard.writeText(item.translatedText)}
                >
                  Copy
                </Btn>
                <Btn variant="ghost" className="!px-2" onClick={() => reopen(item)}>
                  Open
                </Btn>
                <Btn
                  variant="ghost"
                  className="!px-2"
                  onClick={() => void api().historyDelete(item.id).then(() => void reload())}
                >
                  Delete
                </Btn>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

const TABS = [
  { id: 'translate', label: 'Enter Text' },
  { id: 'capture', label: 'Capture' },
  { id: 'live', label: 'Live' },
  { id: 'history', label: 'History' }
] as const

export default function MainWindow() {
  const { settings, update } = useSettings()
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('translate')
  const [capturing, setCapturing] = useState(false)
  const [lensVisible, setLensVisible] = useState(false)

  useEffect(() => api().onCaptureIndicator((p) => setCapturing(p.active)), [])

  const toggleLens = async () => {
    await api().lensToggle()
    setLensVisible((v) => !v)
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 text-slate-900">
      <header className="flex items-center justify-between px-4 py-3 bg-white border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold">
            LL
          </div>
          <div>
            <h1 className="font-semibold leading-tight">LinguaLens AI</h1>
            <p className="text-xs text-slate-500 leading-tight">Floating translator for Windows</p>
          </div>
          {capturing && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-full px-2.5 py-1">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> Capturing screen
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Btn variant={lensVisible ? 'primary' : 'default'} onClick={() => void toggleLens()}>
            {lensVisible ? 'Hide lens' : 'Show lens'}
          </Btn>
          <Btn variant="ghost" onClick={() => void api().openSettings()}>
            Settings
          </Btn>
        </div>
      </header>

      <nav className="flex gap-1 px-4 pt-3 bg-white border-b border-slate-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium rounded-t-lg transition ${
              tab === t.id ? 'bg-slate-50 text-blue-700 border-b-2 border-blue-600' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      <main className="flex-1 overflow-y-auto p-4">
        {tab === 'translate' && <TranslateTab settings={settings} />}
        {tab === 'capture' && <CaptureTab settings={settings} />}
        {tab === 'live' && <LiveTab settings={settings} update={update} />}
        {tab === 'history' && <HistoryTab settings={settings} update={update} />}
      </main>
    </div>
  )
}
