import type { CaptureRegion, LensContent, LiveStatus, TargetLang } from '../shared/types'
import { captureRegionPng, imageHash, hashDistance } from './capture'
import { ocrBuffer, OCR_LANG_MAP } from './ocr'
import { translateText } from './translate'
import { getSettings } from './store'

const CHANGE_THRESHOLD = 6

export interface LiveCallbacks {
  onContent: (content: LensContent) => void
  onStatus: (status: LiveStatus) => void
  onIndicator: (active: boolean) => void
}

export class LiveSession {
  private timer: NodeJS.Timeout | null = null
  private running = false
  private paused = false
  private busy = false
  private region: CaptureRegion | null = null
  private intervalMs = 2000
  private lastHash = ''
  private lastText = ''
  private captures = 0
  private lastCaptureAt?: number
  private lastChangeAt?: number
  private lastError?: string
  private cb: LiveCallbacks | null = null

  status(): LiveStatus {
    return {
      running: this.running,
      paused: this.paused,
      intervalMs: this.intervalMs,
      captures: this.captures,
      lastCaptureAt: this.lastCaptureAt,
      lastChangeAt: this.lastChangeAt,
      error: this.lastError
    }
  }

  start(region: CaptureRegion, intervalMs: number, cb: LiveCallbacks): void {
    this.stop()
    this.region = region
    this.intervalMs = Math.max(500, Math.min(30000, intervalMs || 2000))
    this.cb = cb
    this.running = true
    this.paused = false
    this.lastHash = ''
    this.lastText = ''
    this.lastError = undefined
    cb.onIndicator(true)
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    void this.tick()
    cb.onStatus(this.status())
  }

  pause(): void {
    if (!this.running || this.paused) return
    this.paused = true
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.cb?.onIndicator(false)
    this.cb?.onStatus(this.status())
  }

  resume(): void {
    if (!this.running || !this.paused) return
    this.paused = false
    this.cb?.onIndicator(true)
    this.timer = setInterval(() => void this.tick(), this.intervalMs)
    void this.tick()
    this.cb?.onStatus(this.status())
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    const wasRunning = this.running
    this.running = false
    this.paused = false
    this.busy = false
    if (wasRunning) {
      this.cb?.onIndicator(false)
      this.cb?.onStatus(this.status())
    }
    this.cb = null
  }

  refresh(): void {
    if (this.running && !this.paused) void this.tick()
  }

  private async tick(): Promise<void> {
    if (!this.running || this.paused || this.busy || !this.region || !this.cb) return
    this.busy = true
    try {
      const png = await captureRegionPng(this.region)
      this.captures += 1
      this.lastCaptureAt = Date.now()
      this.lastError = undefined
      const hash = imageHash(png)
      if (!this.lastHash || hashDistance(this.lastHash, hash) > CHANGE_THRESHOLD) {
        this.lastHash = hash
        const settings = getSettings()
        const ocrLangs =
          settings.sourceLang === 'auto'
            ? settings.ocrLangs
            : [OCR_LANG_MAP[settings.sourceLang] ?? 'eng']
        const ocr = await ocrBuffer(png, ocrLangs)
        if (ocr.ok && ocr.text && ocr.text !== this.lastText) {
          this.lastText = ocr.text
          this.lastChangeAt = Date.now()
          const targetLang: TargetLang = settings.targetLang
          this.cb.onContent({
            original: ocr.text,
            translated: '',
            targetLang,
            status: 'loading',
            updatedAt: Date.now()
          })
          const res = await translateText({
            text: ocr.text,
            sourceLang: settings.sourceLang,
            targetLang
          })
          if (!this.running) return
          if (res.ok && res.translatedText) {
            this.cb.onContent({
              original: ocr.text,
              translated: res.translatedText,
              detectedLang: res.detectedLang,
              targetLang,
              status: 'ready',
              updatedAt: Date.now()
            })
          } else {
            this.cb.onContent({
              original: ocr.text,
              translated: '',
              targetLang,
              status: 'error',
              error: res.error ?? 'Translation failed.',
              updatedAt: Date.now()
            })
          }
        }
        // Empty or unchanged OCR: keep the previous translation on screen.
      }
    } catch (err) {
      this.lastError = err instanceof Error ? err.message : 'Capture failed.'
    } finally {
      this.busy = false
      this.cb?.onStatus(this.status())
    }
  }
}
