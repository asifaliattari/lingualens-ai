import Store from 'electron-store'
import { safeStorage } from 'electron'
import { DEFAULT_SETTINGS, Settings } from '../shared/types'

const settingsStore = new Store<Settings>({ name: 'settings', defaults: DEFAULT_SETTINGS })
const secretsStore = new Store<Record<string, string>>({ name: 'secrets', defaults: {} })

export function getSettings(): Settings {
  return { ...DEFAULT_SETTINGS, ...settingsStore.store }
}

export function saveSettings(partial: Partial<Settings>): Settings {
  for (const [key, value] of Object.entries(partial)) {
    if (value !== undefined && key in DEFAULT_SETTINGS) {
      settingsStore.set(key as keyof Settings, value as never)
    }
  }
  return getSettings()
}

function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable()
  } catch {
    return false
  }
}

export function setApiKey(provider: string, key: string): void {
  if (!encryptionAvailable()) throw new Error('Secure storage is not available on this system.')
  const encrypted = safeStorage.encryptString(key)
  secretsStore.set(`apiKey:${provider}`, encrypted.toString('base64'))
}

export function getApiKey(provider: string): string | null {
  const stored = secretsStore.get(`apiKey:${provider}`) as string | undefined
  if (!stored) return null
  if (!encryptionAvailable()) return null
  try {
    return safeStorage.decryptString(Buffer.from(stored, 'base64'))
  } catch {
    return null
  }
}

export function hasApiKey(provider: string): boolean {
  return getApiKey(provider) !== null
}

export function clearApiKey(provider: string): void {
  secretsStore.delete(`apiKey:${provider}`)
}

export function clearAllData(): void {
  settingsStore.clear()
  secretsStore.clear()
}
