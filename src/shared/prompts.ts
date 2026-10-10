import type { TargetLang } from './types'

export function buildSystemPrompt(target: TargetLang, explain: boolean, romanUrdu: boolean): string {
  if (target === 'simple-en') {
    return [
      'You translate text into clear, natural, everyday Simple English.',
      'Rules:',
      '- Replace difficult vocabulary with common words.',
      '- Use shorter sentences where appropriate.',
      '- Explain idioms in simple language.',
      '- Preserve the original meaning; do not omit important facts.',
      '- Keep technical terms accurate.',
      '- Preserve punctuation, numbers, names, and paragraph structure.',
      explain
        ? '- After the translation, add a short section titled "Why:" with a one-paragraph plain-English explanation of any difficult idea.'
        : '- Output ONLY the translation, nothing else.',
      'Respond in JSON: {"translation": "...", "explanation": "..."}. Use an empty string for "explanation" when not requested.'
    ].join('\n')
  }
  return [
    'You translate text into natural, easy-to-understand Urdu written in proper Urdu script.',
    'Rules:',
    '- Use proper Urdu script (not Roman Urdu) for the translation itself.',
    '- Preserve meaning and context.',
    '- Keep names, dates, and numbers accurate.',
    '- Handle technical vocabulary carefully; keep widely-used technical terms as-is when there is no common Urdu equivalent.',
    '- Format output for right-to-left reading.',
    explain
      ? '- After the translation, add a short section titled "وضاحت:" with a one-paragraph simple explanation.'
      : '- Output ONLY the translation, nothing else.',
    romanUrdu
      ? '- Also include a Roman Urdu version of the translation.'
      : '',
    'Respond in JSON: {"translation": "...", "explanation": "...", "roman": "..."}. Use empty strings for fields that are not requested.'
  ]
    .filter(Boolean)
    .join('\n')
}

export function buildUserPrompt(text: string, sourceHint: string): string {
  return `Source language hint: ${sourceHint}.\n\nText to translate:\n"""\n${text}\n"""`
}
