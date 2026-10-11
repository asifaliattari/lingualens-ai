import { app } from 'electron'
import { dirname } from 'node:path'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Minimal JSON file store — a dependency-free replacement for electron-store.
 * electron-store v10+ is ESM-only, and the packaged main process loads it via
 * require(), which returns the module namespace instead of the constructor
 * ("TypeError: Store is not a constructor" crash on startup). This class keeps
 * the same small API surface the app actually uses: .store, .get, .set (single
 * key or object), .delete, .clear. Files live in the app's userData directory.
 */
export class JsonStore<T extends object = Record<string, unknown>> {
  private filePath: string | null = null
  private cache: T | null = null

  constructor(private readonly options: { name: string; defaults?: T }) {}

  private path(): string {
    if (!this.filePath) {
      // Resolved lazily: app.getPath() is only valid after app 'ready',
      // and these stores are constructed at module load time.
      this.filePath = join(app.getPath('userData'), `lingualens-${this.options.name}.json`)
    }
    return this.filePath
  }

  private load(): T {
    if (this.cache) return this.cache
    const defaults = ({ ...(this.options.defaults ?? {}) } as T)
    try {
      const p = this.path()
      if (existsSync(p)) {
        const raw = JSON.parse(readFileSync(p, 'utf-8')) as Partial<T>
        this.cache = { ...defaults, ...raw }
      } else {
        this.cache = defaults
      }
    } catch {
      this.cache = defaults
    }
    return this.cache
  }

  private save(): void {
    try {
      const p = this.path()
      mkdirSync(dirname(p), { recursive: true })
      writeFileSync(p, JSON.stringify(this.cache ?? {}, null, 2), 'utf-8')
    } catch {
      // Storage failure must never crash the app.
    }
  }

  get store(): T {
    return { ...this.load() }
  }

  get<K extends keyof T>(key: K): T[K] | undefined {
    return this.load()[key]
  }

  set(key: keyof T, value: T[keyof T]): void
  set(obj: Partial<T>): void
  set(keyOrObj: keyof T | Partial<T>, value?: T[keyof T]): void {
    const data = this.load()
    if (typeof keyOrObj === 'object' && keyOrObj !== null) {
      Object.assign(data, keyOrObj)
    } else {
      ;(data as Record<string, unknown>)[keyOrObj as string] = value
    }
    this.save()
  }

  delete(key: keyof T): void {
    const data = this.load()
    delete (data as Record<string, unknown>)[key as string]
    this.save()
  }

  clear(): void {
    this.cache = ({ ...(this.options.defaults ?? {}) } as T)
    this.save()
  }
}
