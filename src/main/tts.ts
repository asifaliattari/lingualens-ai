import { spawn, type ChildProcess } from 'node:child_process'
import type { TtsVoice } from '../shared/types'

let current: ChildProcess | null = null

function isWindows(): boolean {
  return process.platform === 'win32'
}

function runPowershell(script: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true
    })
    let out = ''
    let err = ''
    child.stdout?.on('data', (d) => (out += d.toString()))
    child.stderr?.on('data', (d) => (err += d.toString()))
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve(out)
      else reject(new Error(err.trim() || `PowerShell exited with code ${code}`))
    })
  })
}

/** List installed Windows SAPI voices. Windows-only. */
export async function getVoices(): Promise<TtsVoice[]> {
  if (!isWindows()) throw new Error('Text-to-speech uses Windows system voices and requires Windows.')
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    '$s.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name + "|" + $_.VoiceInfo.Culture.Name }'
  ].join('; ')
  const out = await runPowershell(script)
  return out
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const [name, lang] = l.split('|')
      return { name: name?.trim() ?? l, lang: lang?.trim() ?? '' }
    })
}

/** Speak text with a Windows SAPI voice. Resolves when playback finishes. */
export async function speak(text: string, voiceName: string, rate: number): Promise<void> {
  if (!isWindows()) throw new Error('Text-to-speech uses Windows system voices and requires Windows.')
  const clean = (text ?? '').trim().slice(0, 4000)
  if (!clean) throw new Error('Nothing to speak.')
  stop()

  const escaped = clean.replace(/'/g, "''")
  const voiceLine = voiceName ? `$s.SelectVoice('${voiceName.replace(/'/g, "''")}')` : ''
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    voiceLine,
    `$s.Rate = ${Math.max(-10, Math.min(10, Math.round((rate - 1) * 5)))}`,
    `$s.Speak('${escaped}')`
  ]
    .filter(Boolean)
    .join('; ')

  await new Promise<void>((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      windowsHide: true
    })
    current = child
    child.on('error', (e) => {
      if (current === child) current = null
      reject(e)
    })
    child.on('close', (code) => {
      if (current === child) current = null
      if (code === 0) resolve()
      else reject(new Error('Speech playback failed.'))
    })
  })
}

export function stop(): void {
  if (current) {
    try {
      current.kill()
    } catch {
      /* ignore */
    }
    current = null
  }
}
