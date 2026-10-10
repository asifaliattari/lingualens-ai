// Real OCR smoke test: renders text to a PNG (ImageMagick if available,
// otherwise an embedded pixel font), then runs the actual tesseract.js
// worker path used by the app and checks the recognized text.
import { execSync } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const require = createRequire(join(root, 'package.json'))
const { createWorker } = require('tesseract.js')

const outDir = join(tmpdir(), 'lingualens-smoke')
mkdirSync(outDir, { recursive: true })
const imgPath = join(outDir, 'ocr-test.png')
const EXPECTED = 'THE QUICK BROWN FOX'

function hasConvert() {
  try {
    execSync('which convert', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function hasPIL() {
  try {
    execSync('python3 -c "from PIL import Image, ImageDraw, ImageFont"', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

function renderWithPIL(text) {
  const script = [
    'from PIL import Image, ImageDraw, ImageFont',
    'font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 72)',
    'img = Image.new("RGB", (1400, 220), "white")',
    'd = ImageDraw.Draw(img)',
    `d.text((40, 60), ${JSON.stringify(text)}, font=font, fill="black")`,
    `img.save(${JSON.stringify(imgPath)})`,
    ''
  ].join('\n')
  const scriptPath = join(outDir, 'render.py')
  writeFileSync(scriptPath, script)
  execSync(`python3 "${scriptPath}"`, { stdio: 'inherit' })
}

// Minimal 5x7 pixel font for A-Z, 0-9, space — fallback renderer.
const FONT = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01111'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '00010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
}

function renderPixelFont(text, scale = 12) {
  const cols = text.length * 6 * scale
  const rows = 7 * scale + 40
  const W = cols + 80
  const H = rows
  const px = Buffer.alloc(W * H * 3, 255)
  const set = (x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return
    const i = (y * W + x) * 3
    px[i] = px[i + 1] = px[i + 2] = 0
  }
  let cx = 40
  for (const ch of text) {
    const glyph = FONT[ch] || FONT[' ']
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 5; c++) {
        if (glyph[r][c] === '1') {
          for (let sy = 0; sy < scale; sy++)
            for (let sx = 0; sx < scale; sx++) set(cx + c * scale + sx, 20 + r * scale + sy)
        }
      }
    }
    cx += 6 * scale
  }
  // Minimal PNG writer (RGB, no alpha)
  const zlib = require('node:zlib')
  const raw = Buffer.alloc((W * 3 + 1) * H)
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0
    px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3)
  }
  const crcTable = (() => {
    const t = new Int32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      t[n] = c
    }
    return t
  })()
  const crc = (b) => {
    let c = 0xffffffff
    for (let i = 0; i < b.length; i++) c = crcTable[(c ^ b[i]) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(payload.length)
    const tb = Buffer.from(type, 'ascii')
    const cb = Buffer.alloc(4)
    cb.writeUInt32BE(crc(Buffer.concat([tb, payload])))
    return Buffer.concat([len, tb, payload, cb])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(W, 0)
  ihdr.writeUInt32BE(H, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ])
  writeFileSync(imgPath, png)
}

async function main() {
  if (hasConvert()) {
    console.log('Rendering test image with ImageMagick…')
    execSync(
      `convert -size 1200x200 xc:white -font DejaVu-Sans -pointsize 64 -fill black -gravity center -annotate 0 '${EXPECTED}' "${imgPath}"`,
      { stdio: 'inherit' }
    )
  } else if (hasPIL()) {
    console.log('Rendering test image with PIL + DejaVu…')
    renderWithPIL(EXPECTED)
  } else {
    console.log('No image renderer found — using embedded pixel font.')
    renderPixelFont(EXPECTED)
  }
  if (!existsSync(imgPath)) throw new Error('Test image was not created.')

  console.log('Starting tesseract.js worker (eng)…')
  const worker = await createWorker('eng', undefined, {
    cachePath: outDir,
    langPath: 'https://tessdata.projectnaptha.com/4.0.0_best',
    errorHandler: (e) => console.error('[ocr]', e)
  })
  try {
    const { data } = await worker.recognize(imgPath)
    const text = (data.text || '').replace(/\s+/g, ' ').trim()
    console.log('OCR text:', JSON.stringify(text))
    console.log('Confidence:', data.confidence)
    const hit = EXPECTED.split(' ').filter((w) => text.toUpperCase().includes(w)).length
    console.log(`Matched ${hit}/${EXPECTED.split(' ').length} expected words.`)
    if (hit < 3) {
      console.error('SMOKE TEST FAILED: too few words recognized.')
      process.exit(1)
    }
    console.log('SMOKE TEST PASSED: real OCR engine recognized the test image.')
  } finally {
    await worker.terminate()
  }
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e.message)
  process.exit(1)
})
