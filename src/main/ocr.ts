import { createWorker, type Worker } from 'tesseract.js'
import { app } from 'electron'
import type { OcrResult } from '../shared/types'

// Tesseract traineddata codes for our source languages.
export const OCR_LANG_MAP: Record<string, string> = { en: 'eng', fr: 'fra', de: 'deu', nl: 'nld' }

let worker: Worker | null = null
let workerLangs = ''

async function getWorker(langs: string[]): Promise<Worker> {
  const key = [...langs].sort().join('+')
  if (worker && workerLangs === key) return worker
  if (worker) {
    try {
      await worker.terminate()
    } catch {
      /* ignore */
    }
    worker = null
  }
  const cachePath = app.getPath('userData')
  worker = await createWorker(langs, undefined, {
    cachePath,
    // The jsDelivr @tesseract.js-data path used by default 404s; the classic
    // tessdata CDN is reliable. Downloaded once, then cached in userData.
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
    // Route worker errors here so a failed download rejects the promise
    // instead of throwing an uncaught exception that would crash the app.
    errorHandler: (e: unknown) => console.error('[LinguaLens OCR]', e instanceof Error ? e.message : e)
  })
  workerLangs = key
  return worker
}

export async function ocrBuffer(image: Buffer, langs: string[]): Promise<OcrResult> {
  const safeLangs = langs.length > 0 ? langs : ['eng']
  try {
    const w = await getWorker(safeLangs)
    const { data } = await w.recognize(image)
    const text = (data.text ?? '').trim()
    if (!text) {
      return { ok: false, error: 'No text was recognized. Try a larger, sharper region.' }
    }
    return { ok: true, text, confidence: data.confidence }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'OCR failed.' }
  }
}

export async function terminateOcr(): Promise<void> {
  if (worker) {
    try {
      await worker.terminate()
    } catch {
      /* ignore */
    }
    worker = null
    workerLangs = ''
  }
}
