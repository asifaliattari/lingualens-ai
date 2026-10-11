import type { AiProvider, SourceLang, TargetLang, TranslateRequest, TranslateResult } from '../shared/types'
import { buildSystemPrompt, buildUserPrompt } from '../shared/prompts'
import { getApiKey, getSettings } from './store'

/**
 * Lightweight source-language guesser for the four supported languages.
 * (Replaces the `franc` dependency: franc v6 is ESM-only and breaks when the
 * packaged main process loads it via require(). For 4 languages, distinctive
 * characters + common-word scoring is reliable and dependency-free.)
 */
const LANG_MARKERS: { lang: Exclude<SourceLang, 'auto'>; chars: RegExp; words: string[] }[] = [
  {
    lang: 'de',
    chars: /[ßäöü]/,
    words: ['der', 'die', 'das', 'und', 'ist', 'nicht', 'ein', 'eine', 'mit', 'für', 'auf', 'den', 'dem', 'des', 'von', 'sich', 'auch', 'als', 'einen', 'einem', 'einer', 'sind', 'wird', 'werden', 'haben', 'hat', 'war', 'waren', 'oder', 'aber', 'noch', 'nur', 'schon', 'sehr', 'mehr', 'kann', 'muss', 'soll', 'durch', 'über', 'unter', 'zwischen', 'nach', 'vor', 'bei', 'aus', 'zum', 'zur']
  },
  {
    lang: 'fr',
    chars: /[çàâêèëîïôùûœæ]/,
    words: ['le', 'la', 'les', 'de', 'des', 'du', 'un', 'une', 'et', 'est', 'sont', 'que', 'qui', 'pour', 'dans', 'pas', 'plus', 'vous', 'nous', 'ils', 'elles', 'je', 'tu', 'il', 'elle', 'au', 'aux', 'ce', 'cette', 'ces', 'son', 'sa', 'ses', 'mon', 'ma', 'mes', 'avec', 'tout', 'tous', 'comme', 'mais', 'sur', 'par', 'entre', 'sans', 'sous', 'très', 'aussi', 'être', 'avoir', 'fait', 'faire', 'dire', 'deux', 'trois']
  },
  {
    lang: 'nl',
    chars: /ĳ/,
    words: ['de', 'het', 'een', 'van', 'en', 'dat', 'die', 'dit', 'deze', 'niet', 'voor', 'met', 'op', 'te', 'zijn', 'heeft', 'hebben', 'hebt', 'er', 'maar', 'ook', 'door', 'over', 'naar', 'uit', 'bij', 'geen', 'wel', 'nog', 'al', 'als', 'wie', 'wat', 'waar', 'wanneer', 'hoe', 'waarom', 'omdat', 'terwijl', 'tussen', 'onder', 'boven', 'achter', 'wordt', 'worden', 'zijn', 'zal', 'zullen', 'kunnen', 'moeten', 'willen', 'mogen']
  },
  {
    lang: 'en',
    chars: /(?!)/,
    words: ['the', 'and', 'is', 'are', 'was', 'were', 'to', 'of', 'a', 'an', 'in', 'that', 'this', 'it', 'for', 'you', 'with', 'on', 'as', 'be', 'have', 'has', 'had', 'from', 'they', 'them', 'their', 'his', 'her', 'its', 'our', 'your', 'not', 'but', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'because', 'while', 'about', 'into', 'than', 'then', 'them', 'there', 'here', 'will', 'would', 'could', 'should', 'can', 'may', 'might', 'must', 'been', 'being', 'does', 'did', 'done']
  }
]

function guessLanguage(text: string): Exclude<SourceLang, 'auto'> | undefined {
  const tokens = text.toLowerCase().match(/[a-zà-ÿœæß]+/g) ?? []
  const freq = new Map<string, number>()
  for (const t of tokens) freq.set(t, (freq.get(t) ?? 0) + 1)
  let best: Exclude<SourceLang, 'auto'> | undefined
  let bestScore = 0
  let runnerUp = 0
  for (const { lang, chars, words } of LANG_MARKERS) {
    let score = 0
    const charHits = text.match(new RegExp(chars.source, 'gi'))
    if (charHits) score += charHits.length * 4
    for (const w of words) score += freq.get(w) ?? 0
    if (score > bestScore) {
      runnerUp = bestScore
      bestScore = score
      best = lang
    } else if (score > runnerUp) {
      runnerUp = score
    }
  }
  // Require a minimum signal and a clear winner; otherwise leave it undecided.
  return best !== undefined && bestScore >= 2 && bestScore > runnerUp ? best : undefined
}

export function detectLanguage(text: string): Exclude<SourceLang, 'auto'> | undefined {
  const sample = text.trim().slice(0, 2000)
  if (sample.length < 8) return undefined
  try {
    return guessLanguage(sample)
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

