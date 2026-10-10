import { desktopCapturer, nativeImage, screen } from 'electron'
import type { CaptureRegion } from '../shared/types'

function findDisplay(displayId: number) {
  const displays = screen.getAllDisplays()
  return displays.find((d) => d.id === displayId) ?? screen.getPrimaryDisplay()
}

/** Capture a screen region as a PNG buffer. Coordinates are in CSS pixels. */
export async function captureRegionPng(region: CaptureRegion): Promise<Buffer> {
  const display = findDisplay(region.displayId)
  const scale = display.scaleFactor || 1
  const thumbWidth = Math.round(display.bounds.width * scale)
  const thumbHeight = Math.round(display.bounds.height * scale)

  const sources = await desktopCapturer.getSources({
    types: ['screen'],
    thumbnailSize: { width: thumbWidth, height: thumbHeight }
  })
  const source = sources.find((s) => String(s.display_id) === String(display.id)) ?? sources[0]
  if (!source) throw new Error('No screen capture source is available.')

  const full = source.thumbnail
  // Thumbnail is in device pixels; the requested region is in CSS pixels.
  const crop = {
    x: Math.max(0, Math.round(region.x * scale)),
    y: Math.max(0, Math.round(region.y * scale)),
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale))
  }
  const cropped = full.crop(crop)
  if (cropped.isEmpty()) throw new Error('The captured region is empty.')
  return cropped.toPNG()
}

/** 64-bit average hash of a PNG buffer, returned as a hex string. */
export function imageHash(png: Buffer): string {
  const img = nativeImage.createFromBuffer(png)
  const small = img.resize({ width: 16, height: 16, quality: 'good' })
  const bmp = small.toBitmap()
  const pixels: number[] = []
  for (let i = 0; i < bmp.length; i += 4) {
    // BGRA -> luminance
    const lum = 0.114 * bmp[i] + 0.587 * bmp[i + 1] + 0.299 * bmp[i + 2]
    pixels.push(lum)
  }
  const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length
  let bits = ''
  for (const p of pixels) bits += p >= avg ? '1' : '0'
  let hex = ''
  for (let i = 0; i < bits.length; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16)
  }
  return hex
}

export function hashDistance(a: string, b: string): number {
  let dist = 0
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const xor = parseInt(a[i], 16) ^ parseInt(b[i], 16)
    dist += xor.toString(2).split('').filter((c) => c === '1').length
  }
  return dist
}
