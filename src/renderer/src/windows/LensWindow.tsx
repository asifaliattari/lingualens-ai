import { useCallback, useEffect, useRef, useState } from 'react'
import type { LensContent, LensMode, LensOptions } from '@shared/types'
import { Spinner } from '../components/ui'

const api = () => window.lingualens

const IDLE: LensContent = {
  original: '',
  translated: '',
  targetLang: 'simple-en',
  status: 'idle',
  updatedAt: Date.now()
}

const MODE_LABELS: { id: LensMode; label: string }[] = [
  { id: 'side-by-side', label: 'Side-by-side' },
  { id: 'stacked', label: 'Stacked' },
  { id: 'translation-only', label: 'Translation only' },
  { id: 'compact', label: 'Compact card' }
]

interface Bounds {
  x: number
  y: number
  width: number
  height: number
}

export default function LensWindow() {
  const [content, setContent] = useState<LensContent>(IDLE)
  const [options, setOptions] = useState<LensOptions>({
    opacity: 0.94,
    mode: 'side-by-side',
    layout: 'expanded',
    fontSize: 15,
    lineHeight: 1.55,
    rotation: 0,
    locked: false,
    pinned: true
  })
  const [maximized, setMaximized] = useState(false)
  const [prevBounds, setPrevBounds] = useState<Bounds | null>(null)
  const boundsRef = useRef<Bounds>({ x: 0, y: 0, width: 470, height: 340 })
  const rafRef = useRef(0)
  const cardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api()
      .getSettings()
      .then((s) =>
        setOptions((o) => ({
          ...o,
          opacity: s.lensOpacity,
          mode: s.lensMode,
          fontSize: s.lensFontSize,
          lineHeight: s.lensLineHeight
        }))
      )
      .catch(() => {})
    api()
      .lensGetBounds()
      .then((b) => {
        if (b) boundsRef.current = b
      })
      .catch(() => {})
    const offContent = api().onLensContent(setContent)
    const offOptions = api().onLensOptions((o) => setOptions((prev) => ({ ...prev, ...o })))
    return () => {
      offContent()
      offOptions()
    }
  }, [])

  const applyBounds = useCallback(async (b: Partial<Bounds>) => {
    cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(async () => {
      const res = await api().lensSetBounds(b)
      if (res.bounds) boundsRef.current = res.bounds
      else boundsRef.current = { ...boundsRef.current, ...b }
    })
  }, [])

  // ---- move ----
  const beginDrag = (e: React.MouseEvent) => {
    if (options.locked || maximized) return
    if ((e.target as HTMLElement).closest('.lens-no-drag')) return
    e.preventDefault()
    const sx = e.screenX
    const sy = e.screenY
    const { x: bx, y: by } = boundsRef.current
    const move = (ev: MouseEvent) => {
      void applyBounds({ x: Math.round(bx + (ev.screenX - sx)), y: Math.round(by + (ev.screenY - sy)) })
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ---- resize ----
  const beginResize = (dir: string) => (e: React.MouseEvent) => {
    if (options.locked || maximized) return
    e.preventDefault()
    e.stopPropagation()
    const sx = e.screenX
    const sy = e.screenY
    const { x: bx, y: by, width: bw, height: bh } = boundsRef.current
    const move = (ev: MouseEvent) => {
      const dx = ev.screenX - sx
      const dy = ev.screenY - sy
      const next: Partial<Bounds> = {}
      let w = bw
      let h = bh
      if (dir.includes('e')) w = Math.max(240, bw + dx)
      if (dir.includes('s')) h = Math.max(160, bh + dy)
      if (dir.includes('w')) {
        w = Math.max(240, bw - dx)
        next.x = Math.round(bx + (bw - w))
      }
      if (dir.includes('n')) {
        h = Math.max(160, bh - dy)
        next.y = Math.round(by + (bh - h))
      }
      next.width = Math.round(w)
      next.height = Math.round(h)
      void applyBounds(next)
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  // ---- rotation ----
  const beginRotate = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const rect = cardRef.current?.getBoundingClientRect()
    if (!rect) return
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const angleAt = (x: number, y: number) => (Math.atan2(y - cy, x - cx) * 180) / Math.PI
    const startAngle = angleAt(e.clientX, e.clientY)
    const startRotation = options.rotation
    const move = (ev: MouseEvent) => {
      let rot = startRotation + (angleAt(ev.clientX, ev.clientY) - startAngle)
      rot = ((((rot + 180) % 360) + 360) % 360) - 180
      setOptions((o) => ({ ...o, rotation: Math.round(rot) }))
    }
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const resetPosition = async () => {
    const displays = await api().getDisplays().catch(() => [])
    const area = displays[0]?.workArea ?? { x: 0, y: 0, width: 1280, height: 720 }
    const b = { x: Math.round(area.x + area.width - 470 - 40), y: Math.round(area.y + area.height - 340 - 60), width: 470, height: 340 }
    setOptions((o) => ({ ...o, rotation: 0 }))
    setMaximized(false)
    await applyBounds(b)
  }

  const toggleMaximize = async () => {
    const displays = await api().getDisplays().catch(() => [])
    const area = displays[0]?.workArea ?? { x: 0, y: 0, width: 1280, height: 720 }
    if (!maximized) {
      setPrevBounds({ ...boundsRef.current })
      await applyBounds({ x: area.x, y: area.y, width: area.width, height: area.height })
      setMaximized(true)
    } else {
      const p = prevBounds ?? { x: area.x + 100, y: area.y + 100, width: 470, height: 340 }
      await applyBounds(p)
      setMaximized(false)
    }
  }

  const togglePin = async () => {
    const next = !options.pinned
    setOptions((o) => ({ ...o, pinned: next }))
    await api().lensSetPinned(next)
  }

  const isUrdu = content.targetLang === 'ur'
  const compactLayout = options.layout === 'compact' || options.mode === 'compact'

  const translationBlock = (cls = '') => (
    <div className={`min-w-0 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
        {isUrdu ? 'Urdu' : 'Simple English'}
      </div>
      {content.status === 'loading' ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 py-3">
          <Spinner /> Translating…
        </div>
      ) : content.status === 'error' ? (
        <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
          ⚠ {content.error ?? 'Translation failed.'}
        </div>
      ) : content.translated ? (
        <p
          className={`whitespace-pre-wrap text-slate-900 select-text ${isUrdu ? 'urdu-text' : ''}`}
          style={{ fontSize: isUrdu ? options.fontSize + 2 : options.fontSize, lineHeight: options.lineHeight }}
        >
          {content.translated}
        </p>
      ) : (
        <p className="text-sm text-slate-400 italic">Translation will appear here…</p>
      )}
    </div>
  )

  const originalBlock = (cls = '') => (
    <div className={`min-w-0 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-slate-400 mb-1">
        Original{content.detectedLang ? ` (${content.detectedLang})` : ''}
      </div>
      {content.original ? (
        <p
          className="whitespace-pre-wrap text-slate-700 select-text"
          style={{ fontSize: options.fontSize - 1, lineHeight: options.lineHeight }}
        >
          {content.original}
        </p>
      ) : (
        <p className="text-sm text-slate-400 italic">Capture a region or translate text to begin.</p>
      )}
    </div>
  )

  const toolBtn =
    'lens-no-drag w-6 h-6 flex items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800 text-xs'

  return (
    <div className="w-screen h-screen overflow-hidden bg-transparent relative select-none">
      {/* rotated content layer */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          ref={cardRef}
          className="absolute inset-x-3 top-3 bottom-14 pointer-events-auto"
          style={{ transform: `rotate(${options.rotation}deg)`, transformOrigin: 'center center' }}
        >
          <div
            className="w-full h-full rounded-2xl border border-white/40 shadow-2xl flex flex-col overflow-hidden"
            style={{ background: `rgba(255,255,255,${options.opacity})`, backdropFilter: 'blur(14px)' }}
            onMouseDown={beginDrag}
          >
            {/* toolbar */}
            {!compactLayout && (
              <div className="lens-no-drag flex items-center gap-1 px-2 py-1 border-b border-slate-200/70 bg-white/40">
                <select
                  value={options.mode}
                  onChange={(e) => setOptions((o) => ({ ...o, mode: e.target.value as LensMode }))}
                  className="text-[11px] rounded-md border border-slate-300 bg-white/80 px-1 py-0.5"
                  title="Display mode"
                >
                  {MODE_LABELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label}
                    </option>
                  ))}
                </select>
                <input
                  type="range"
                  min={30}
                  max={100}
                  value={Math.round(options.opacity * 100)}
                  onChange={(e) => setOptions((o) => ({ ...o, opacity: Number(e.target.value) / 100 }))}
                  className="w-16"
                  title="Lens opacity"
                />
                <div className="flex-1" />
                <button className={toolBtn} title={options.locked ? 'Unlock position' : 'Lock position'}
                  onClick={() => setOptions((o) => ({ ...o, locked: !o.locked }))}>
                  {options.locked ? '🔒' : '🔓'}
                </button>
                <button className={toolBtn} title={options.pinned ? 'Unpin (allow other windows above)' : 'Pin on top'}
                  onClick={() => void togglePin()}>
                  {options.pinned ? '📌' : '📍'}
                </button>
                <button className={toolBtn} title="Reset rotation"
                  onClick={() => setOptions((o) => ({ ...o, rotation: 0 }))}>⟲</button>
                <button className={toolBtn} title="Reset position" onClick={() => void resetPosition()}>⌂</button>
                <button className={toolBtn} title={maximized ? 'Restore' : 'Maximize'} onClick={() => void toggleMaximize()}>
                  {maximized ? '❐' : '☐'}
                </button>
                <button className={toolBtn} title="Minimize (hide lens)" onClick={() => void api().lensHide()}>—</button>
                <button className={toolBtn} title="Close lens" onClick={() => void api().lensHide()}>✕</button>
              </div>
            )}
            {compactLayout && (
              <div className="lens-no-drag flex items-center gap-1 px-2 py-1 bg-white/40">
                <span className="text-[11px] font-semibold text-slate-600">LinguaLens</span>
                <div className="flex-1" />
                <button className={toolBtn} title="Expand"
                  onClick={() => setOptions((o) => ({ ...o, layout: 'expanded', mode: 'side-by-side' }))}>⤢</button>
                <button className={toolBtn} title="Hide lens" onClick={() => void api().lensHide()}>✕</button>
              </div>
            )}

            {/* content */}
            <div className="flex-1 overflow-y-auto p-3 lens-no-drag">
              {options.mode === 'side-by-side' && !compactLayout && (
                <div className="grid grid-cols-2 gap-3 h-full">
                  {originalBlock()}
                  <div className="border-l border-slate-200/70 pl-3">{translationBlock()}</div>
                </div>
              )}
              {options.mode === 'stacked' && !compactLayout && (
                <div className="flex flex-col gap-3">
                  {originalBlock()}
                  <div className="border-t border-slate-200/70 pt-2">{translationBlock()}</div>
                </div>
              )}
              {(options.mode === 'translation-only' || compactLayout) && translationBlock()}
              {content.status === 'idle' && !content.original && (
                <p className="text-xs text-slate-400 mt-2">
                  Tip: press <kbd className="px-1 rounded bg-slate-200">Ctrl+Shift+C</kbd> to capture any text on screen.
                </p>
              )}
            </div>

            {/* footer */}
            {!compactLayout && (
              <div className="lens-no-drag flex items-center gap-2 px-3 py-1 border-t border-slate-200/70 bg-white/40 text-[11px] text-slate-500">
                <button className={toolBtn} title="Smaller text"
                  onClick={() => setOptions((o) => ({ ...o, fontSize: Math.max(10, o.fontSize - 1) }))}>A−</button>
                <button className={toolBtn} title="Larger text"
                  onClick={() => setOptions((o) => ({ ...o, fontSize: Math.min(28, o.fontSize + 1) }))}>A+</button>
                <button
                  className="lens-no-drag text-[11px] px-2 py-0.5 rounded-md hover:bg-slate-200"
                  onClick={() => setOptions((o) => ({ ...o, layout: 'compact' }))}
                  title="Compact floating card"
                >
                  Compact
                </button>
                <div className="flex-1" />
                {options.rotation !== 0 && <span>{options.rotation}°</span>}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* rotation handle (unrotated layer keeps hit-testing reliable) */}
      {!options.locked && !compactLayout && (
        <div className="absolute left-1/2 bottom-2 -translate-x-1/2 flex flex-col items-center">
          <div className="w-px h-4 bg-blue-500/70" />
          <button
            className="lens-no-drag w-7 h-7 rounded-full bg-blue-600 text-white text-sm shadow-lg hover:bg-blue-700 cursor-grab active:cursor-grabbing"
            title="Drag to rotate the lens (double-click to reset)"
            onMouseDown={beginRotate}
            onDoubleClick={() => setOptions((o) => ({ ...o, rotation: 0 }))}
          >
            ⟳
          </button>
        </div>
      )}

      {/* resize handles (unrotated layer) */}
      {!options.locked &&
        !maximized &&
        (['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'] as const).map((dir) => {
          const pos: Record<string, string> = {
            nw: 'top-0 left-0', n: 'top-0 left-1/2', ne: 'top-0 right-0',
            e: 'top-1/2 right-0', se: 'bottom-0 right-0', s: 'bottom-0 left-1/2',
            sw: 'bottom-0 left-0', w: 'top-1/2 left-0'
          }
          const cursor: Record<string, string> = {
            nw: 'nwse-resize', n: 'ns-resize', ne: 'nesw-resize', e: 'ew-resize',
            se: 'nwse-resize', s: 'ns-resize', sw: 'nesw-resize', w: 'ew-resize'
          }
          return (
            <div
              key={dir}
              className={`lens-no-drag absolute ${pos[dir]} w-4 h-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-blue-600/0 hover:bg-blue-600/80 border border-blue-600/0 hover:border-blue-700`}
              style={{ cursor: cursor[dir] }}
              onMouseDown={beginResize(dir)}
            />
          )
        })}
    </div>
  )
}
