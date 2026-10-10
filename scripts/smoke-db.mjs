// Verifies the sql.js (SQLite/WASM) history engine loads and works in Node,
// mirroring the schema used by src/main/history.ts.
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'))

async function main() {
  const initSqlJs = require('sql.js')
  const wasmPath = require.resolve('sql.js/dist/sql-wasm.wasm')
  const SQL = await initSqlJs({ locateFile: () => wasmPath })
  const db = new SQL.Database()
  db.run(`CREATE TABLE history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_text TEXT NOT NULL,
    translated_text TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    provider TEXT NOT NULL,
    created_at TEXT NOT NULL
  )`)
  db.run('INSERT INTO history VALUES (NULL, ?, ?, ?, ?, ?, ?)', [
    'Bonjour le monde',
    'Hello world',
    'fr',
    'simple-en',
    'gemini',
    new Date().toISOString()
  ])
  const res = db.exec("SELECT original_text, translated_text FROM history WHERE original_text LIKE '%Bonjour%'")
  const rows = res[0]?.values ?? []
  console.log('Rows found:', rows.length, rows[0])
  if (rows.length !== 1 || rows[0][1] !== 'Hello world') {
    console.error('SMOKE TEST FAILED')
    process.exit(1)
  }
  db.close()
  console.log('SMOKE TEST PASSED: sql.js history engine works.')
}

main().catch((e) => {
  console.error('SMOKE TEST ERROR:', e.message)
  process.exit(1)
})
