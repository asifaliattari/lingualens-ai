import initSqlJs, { type Database } from 'sql.js'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type { HistoryItem } from '../shared/types'

let db: Database | null = null
let dbPath = ''

function findWasm(): string {
  const candidates = [
    // Dev: project node_modules
    path.join(app.getAppPath(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    // Packaged: unpacked from the asar by electron-builder
    path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm')
  ]
  for (const c of candidates) {
    if (fs.existsSync(c)) return c
  }
  throw new Error('Could not locate sql-wasm.wasm. Reinstall the application.')
}

export async function initHistory(): Promise<void> {
  if (db) return
  const SQL = await initSqlJs({ locateFile: () => findWasm() })
  dbPath = path.join(app.getPath('userData'), 'lingualens-history.db')
  if (fs.existsSync(dbPath)) {
    db = new SQL.Database(new Uint8Array(fs.readFileSync(dbPath)))
  } else {
    db = new SQL.Database()
  }
  db.run(`
    CREATE TABLE IF NOT EXISTS history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      original_text TEXT NOT NULL,
      translated_text TEXT NOT NULL,
      source_lang TEXT NOT NULL,
      target_lang TEXT NOT NULL,
      provider TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_history_created ON history(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_history_text ON history(original_text, translated_text);
  `)
  persist()
}

function persist(): void {
  if (!db || !dbPath) return
  fs.writeFileSync(dbPath, Buffer.from(db.export()))
}

function ensure(): Database {
  if (!db) throw new Error('History database is not initialized.')
  return db
}

export function addHistory(item: Omit<HistoryItem, 'id' | 'createdAt'>): void {
  const d = ensure()
  d.run(
    'INSERT INTO history (original_text, translated_text, source_lang, target_lang, provider, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [
      item.originalText,
      item.translatedText,
      item.sourceLang,
      item.targetLang,
      item.provider,
      new Date().toISOString()
    ]
  )
  // Keep the table bounded (newest 2000 rows)
  d.run('DELETE FROM history WHERE id NOT IN (SELECT id FROM history ORDER BY id DESC LIMIT 2000)')
  persist()
}

export function listHistory(query: string, limit: number): HistoryItem[] {
  const d = ensure()
  const q = `%${query}%`
  const stmt = d.prepare(
    'SELECT id, original_text, translated_text, source_lang, target_lang, provider, created_at FROM history WHERE original_text LIKE ? OR translated_text LIKE ? ORDER BY id DESC LIMIT ?'
  )
  stmt.bind([q, q, Math.min(Math.max(limit, 1), 500)])
  const rows: HistoryItem[] = []
  while (stmt.step()) {
    const r = stmt.getAsObject() as Record<string, unknown>
    rows.push({
      id: r.id as number,
      originalText: r.original_text as string,
      translatedText: r.translated_text as string,
      sourceLang: r.source_lang as string,
      targetLang: r.target_lang as string,
      provider: r.provider as string,
      createdAt: r.created_at as string
    })
  }
  stmt.free()
  return rows
}

export function deleteHistory(id: number): void {
  ensure().run('DELETE FROM history WHERE id = ?', [id])
  persist()
}

export function clearHistory(): void {
  ensure().run('DELETE FROM history')
  persist()
}

export function closeHistory(): void {
  if (db) {
    persist()
    db.close()
    db = null
  }
}
