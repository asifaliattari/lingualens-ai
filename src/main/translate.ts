import { franc } from 'franc'
import type { AiProvider, SourceLang, TargetLang, TranslateRequest, TranslateResult } from '../shared/types'
import { buildSystemPrompt, buildUserPrompt } from '../shared/prompts'
import { getApiKey, getSettings } from './store'

const ISO3_TO_LANG: Record<string, Exclude<SourceLang, 'auto'>> = {
  eng: 'en',
  fra: 'fr',
  deu: 'de',
  nld: 'nl'
}

export function detectLanguage(text: string): Exclude<SourceLang, 'auto'> | undefined {
  const sample = text.trim().slice(0, 2000)
  if (sample.length < 8) return undefined
  try {
    const code = franc(sample, { minLength: 8 })
    return ISO3_TO_LANG[code]
  } catch {
    return undefined
  }
}

interface LlmJson {
  translation?: string
  explanation?: string
  roman?: string
}

function extractJson(raw: string): LlmJson {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/)
  const candidate = (fenced ? fenced[1] : raw).trim()
  try {
    return JSON.parse(candidate) as LlmJson
  } catch {
    const start = candidate.indexOf('{')
    const end = candidate.lastIndexOf('}')
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1)) as LlmJson
      } catch {
        /* fall through */
      }
    }
    return { translation: candidate }
  }
}

async function callGemini(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ parts: [{ text: user }] }],
      generationConfig: { temperature: 0.2, responseMimeType: 'application/json' }
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini API error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    error?: { message?: string }
  }
  if (data.error) throw new Error(`Gemini API error: ${data.error.message}`)
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text) throw new Error('Gemini returned an empty response.')
  return text
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string): Promise<string> {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user }
      ]
    })
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI API error ${res.status}: ${body.slice(0, 300)}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
    error?: { message?: string }
  }
  if (data.error) throw new Error(`OpenAI API error: ${data.error.message}`)
  const text = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('OpenAI returned an empty response.')
  return text
}

export async function translateText(req: TranslateRequest): Promise<TranslateResult> {
  const text = (req.text ?? '').trim()
  if (!text) return { ok: false, originalText: '', targetLang: req.targetLang, error: 'Nothing to translate.' }
  if (text.length > 8000) {
    return { ok: false, originalText: text, targetLang: req.targetLang, error: 'Text is too long (max 8000 characters).' }
  }
  const settings = getSettings()
  const provider: AiProvider = req.provider ?? settings.provider
  const apiKey = getApiKey(provider)
  if (!apiKey) {
    return {
      ok: false,
      originalText: text,
      targetLang: req.targetLang,
      error: `No API key configured for ${provider === 'gemini' ? 'Google Gemini' : 'OpenAI'}. Open Settings and add your key to enable real translation.`
    }
  }

  let sourceLang: Exclude<SourceLang, 'auto'> | undefined =
    req.sourceLang === 'auto' ? detectLanguage(text) : req.sourceLang
  if (!sourceLang) sourceLang = 'en'
  const sourceHint =
    req.sourceLang === 'auto' ? `auto-detected as ${sourceLang} (verify if it looks wrong)` : sourceLang

  const system = buildSystemPrompt(req.targetLang, req.explain ?? settings.explain, req.romanUrdu ?? settings.romanUrdu)
  const user = buildUserPrompt(text, sourceHint)
  const complex = req.complex ?? text.length > 1200
  const model =
    provider === 'gemini'
      ? complex
        ? settings.geminiComplexModel
        : settings.geminiModel
      : complex
        ? settings.openaiComplexModel
        : settings.openaiModel

  try {
    const raw = provider === 'gemini' ? await callGemini(apiKey, model, system, user) : await callOpenAI(apiKey, model, system, user)
    const parsed = extractJson(raw)
    const translatedText = (parsed.translation ?? '').trim()
    if (!translatedText) throw new Error('The AI returned an empty translation.')
    return {
      ok: true,
      originalText: text,
      translatedText,
      detectedLang: sourceLang,
      targetLang: req.targetLang,
      explanation: parsed.explanation?.trim() || undefined,
      provider
    }
  } catch (err) {
    return {
      ok: false,
      originalText: text,
      targetLang: req.targetLang,
      detectedLang: sourceLang,
      provider,
      error: err instanceof Error ? err.message : 'Translation failed.'
    }
  }
}

