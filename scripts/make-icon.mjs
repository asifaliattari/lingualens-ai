// Generates resources/icon.png (256x256) with zero dependencies.
// A blue-violet rounded square with a white magnifier/translation-lens glyph.
import { writeFileSync, mkdirSync } from 'node:fs'
import { deflateSync } from 'node:zlib'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
mkdirSync(join(root, 'resources'), { recursive: true })

const W = 256
const H = 256
const data = Buffer.alloc(W * H * 4)

function crc32(buf) {
  let table = crc32.table
  if (!table) {
    table = crc32.table = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < buf.length; i++) crc = table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, payload) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(payload.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, payload])))
  return Buffer.concat([len, typeBuf, payload, crc])
}

function setPixel(x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  data[i] = r
  data[i + 1] = g
  data[i + 2] = b
  data[i + 3] = a
}

const lerp = (a, b, t) => Math.round(a + (b - a) * t)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))

// Rounded-square gradient background (blue-500 -> violet-600), corner radius 56
const R = 56
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const cx = clamp(x, R, W - 1 - R)
    const cy = clamp(y, R, H - 1 - R)
    const d = Math.hypot(x - cx, y - cy)
    if (d <= R) {
      const t = y / (H - 1)
      setPixel(x, y, lerp(59, 124, t), lerp(130, 58, t), lerp(246, 237, t))
    }
  }
}

// White lens: circle outline centered (120,112), radius 58, stroke 15
const ccx = 120
const ccy = 112
const cr = 58
const stroke = 15
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const d = Math.hypot(x - ccx, y - ccy)
    if (Math.abs(d - cr) <= stroke / 2) setPixel(x, y, 255, 255, 255, 235)
  }
}

// Handle: thick line from circle edge toward bottom-right
const hx0 = ccx + cr * 0.72
const hy0 = ccy + cr * 0.72
const hx1 = 196
const hy1 = 196
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = clamp(((x - hx0) * (hx1 - hx0) + (y - hy0) * (hy1 - hy0)) / ((hx1 - hx0) ** 2 + (hy1 - hy0) ** 2), 0, 1)
    const px = hx0 + (hx1 - hx0) * t
    const py = hy0 + (hy1 - hy0) * t
    if (Math.hypot(x - px, y - py) <= 11) setPixel(x, y, 255, 255, 255, 235)
  }
}

// Inner "A" hint: simple serif-less A drawn with strokes inside the lens
const ax = 120
const ay = 112
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const inLeft = Math.abs(x - (ax - 22 + (y - (ay - 26)) * 0.55)) <= 4 && y >= ay - 26 && y <= ay + 26
    const inRight = Math.abs(x - (ax + 22 - (y - (ay - 26)) * 0.55)) <= 4 && y >= ay - 26 && y <= ay + 26
    const inBar = Math.abs(y - (ay + 8)) <= 4 && Math.abs(x - ax) <= 16
    if (inLeft || inRight || inBar) setPixel(x, y, 255, 255, 255, 235)
  }
}

const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  data.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0))
])

const outPath = join(root, 'resources', 'icon.png')
writeFileSync(outPath, png)
console.log('Wrote', outPath, png.length, 'bytes')
