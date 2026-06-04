// Chat-i18n Phase 2: Maschinelle Übersetzung von Human-Freitext-Chatnachrichten
// via Claude Haiku.
//
// Im Kunde-Chat ist die Quell-Sprache der zu übersetzenden Nachrichten immer
// Deutsch (Staff/SV/Admin schreiben deutsch). Übersetzt wird also de → Leser-
// Locale. System-Messages laufen über Phase-1-Templates (template_key) und
// kommen hier nicht an.
//
// Fehler werden via Return-Shape signalisiert (kein throw nach außen) — der
// Caller (Server-Action) reicht den Fehler an den Client durch.

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export type ChatTranslateLocale = 'en' | 'tr' | 'pl' | 'ru' | 'ar'

const LOCALE_NAMES: Record<ChatTranslateLocale, string> = {
  en: 'English',
  tr: 'Turkish',
  pl: 'Polish',
  ru: 'Russian',
  ar: 'Arabic',
}

export async function uebersetzeChatText(
  text: string,
  zielLocale: ChatTranslateLocale,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: false, error: 'ANTHROPIC_API_KEY nicht gesetzt' }
  }

  const languageName = LOCALE_NAMES[zielLocale]
  const system =
    `Translate the following German chat message from a German vehicle damage ` +
    `claim-management app into ${languageName}. Return ONLY the translation, ` +
    `without quotation marks or explanation. Keep proper nouns (Claimondo, ` +
    `LexDrive), amounts, license plates, and date/time references unchanged. ` +
    `Use a polite, formal tone (German "Sie").`

  const anthropic = new Anthropic({ apiKey, timeout: 30_000, maxRetries: 2 })

  try {
    const response = await anthropic.messages.create({
      model: AI_MODELS.chat_translate,
      max_tokens: 1024,
      system,
      messages: [{ role: 'user', content: text }],
    })

    const firstBlock = response.content[0]
    const translated =
      firstBlock && firstBlock.type === 'text' ? firstBlock.text.trim() : ''

    if (!translated) {
      return { ok: false, error: 'Übersetzung leer' }
    }
    return { ok: true, text: translated }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Übersetzungs-Fehler'
    console.error('[chat-translate] Übersetzung fehlgeschlagen:', err)
    return { ok: false, error: msg }
  }
}
