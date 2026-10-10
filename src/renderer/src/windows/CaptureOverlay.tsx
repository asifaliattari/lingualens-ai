import { useEffect, useRef, useState } from 'react'
import type { CaptureRegion } from '@shared/types'

const api = () => window.lingualens

export default function CaptureOverlay() {
  const [rect, setRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const start = useRef<{ x: number; y: number } | null>(null)
  const displays = useRef<{ id: number; bounds: { x: number; y: number; width: number; height: number } }[]>([])

  useEffect(() => {
    api()
      .getDisplays()
      .then((d) => {
        displays.current = d
      })
      .catch(() => {})
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') api().overlayDone(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    start.current = { x: e.screenX, y: e.screenY }
    setRect({ x: e.screenX, y: e.screenY, w: 0, h: 0 })
  }

  const onMouseMove = (e: React.MouseEvent) => {
    const s = start.current
    if (!s) return
    setRect({
      x: Math.min(s.x, e.screenX),
      y: Math.min(s.y, e.screenY),
      w: Math.abs(e.screenX - s.x),
      h: Math.abs(e.screenY - s.y)
    })
  }

  const onMouseUp = () => {
    const r = rect
    start.current = null
    if (!r || r.w < 10 || r.h < 10) {
      setRect(null)
      return
    }
    const cx = r.x + r.w / 2
    const cy = r.y + r.h / 2
    const display =
      displays.current.find(
        (d) => cx >= d.bounds.x && cx < d.bounds.x + d.bounds.width && cy >= d.bounds.y && cy < d.bounds.y + d.bounds.height
      ) ?? displays.current[0]
    const region: CaptureRegion = {
      x: Math.round(r.x),
      y: Math.round(r.y),
      width: Math.round(r.w),
      height: Math.round(r.h),
      displayId: display?.id ?? 0
    }
    setRect(null)
    api().overlayDone(region)
  }

  return (
    <div
      className="w-screen h-screen relative overflow-hidden"
      style={{ background: 'rgba(15, 23, 42, 0.35)', cursor: 'crosshair' }}
      onMouseDown={onMouseDown}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
    >
      <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white text-sm rounded-full px-4 py-1.5 pointer-events-none">
        Drag a rectangle around the text • <kbd className="px-1 rounded bg-slate-700">Esc</kbd> to cancel
      </div>
      {rect && rect.w > 2 && rect.h > 2 && (
        <div
          className="absolute border-2 border-blue-500 bg-blue-500/10 pointer-events-none"
          style={{
            // Position relative to the window: window origin == union origin, but the
            // renderer viewport starts at the window origin, so use offset within window.
            left: rect.x - window.screenX,
            top: rect.y - window.screenY,
            width: rect.w,
            height: rect.h
          }}
        >
          <div className="absolute -top-7 left-0 bg-blue-600 text-white text-xs rounded px-2 py-0.5 whitespace-nowrap">
            {Math.round(rect.w)} × {Math.round(rect.h)}
          </div>
          <div className="absolute inset-0 border border-dashed border-white/70" />
        </div>
      )}
    </div>
  )
}
