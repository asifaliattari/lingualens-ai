import { globalShortcut } from 'electron'
import type { ShortcutDef } from '../shared/types'

export type ShortcutHandlers = Record<ShortcutDef['action'], () => void>

export interface ShortcutRegistration {
  action: ShortcutDef['action']
  ok: boolean
  error?: string
}

/**
 * Registers global shortcuts. Returns per-action results so conflicts can be
 * reported instead of silently failing. Never throws for a single bad entry.
 */
export function registerShortcuts(
  shortcuts: Record<ShortcutDef['action'], string>,
  handlers: ShortcutHandlers
): ShortcutRegistration[] {
  globalShortcut.unregisterAll()
  const results: ShortcutRegistration[] = []
  for (const [action, accelerator] of Object.entries(shortcuts) as [ShortcutDef['action'], string][]) {
    const acc = (accelerator ?? '').trim()
    if (!acc) {
      results.push({ action, ok: false, error: 'Empty shortcut.' })
      continue
    }
    try {
      const ok = globalShortcut.register(acc, handlers[action])
      results.push(
        ok
          ? { action, ok: true }
          : { action, ok: false, error: `Could not register ${acc}. It may be in use by Windows or another app.` }
      )
    } catch (err) {
      results.push({ action, ok: false, error: err instanceof Error ? err.message : 'Registration failed.' })
    }
  }
  return results
}

export function unregisterShortcuts(): void {
  globalShortcut.unregisterAll()
}
