// AAR-541 (C4): Rolle → Kanal-Mapping für die Admin-Fallakte und andere
// rollenabhängige Chat-Consumer.
//
// Admin + KB sind Super-User: sehen alle 5 Kanäle inklusive des internen
// KB↔SV-Chats, den der Kunde niemals sehen darf.

import type { ChatKanal } from '@/lib/communications/channels'
import type { FallakteRolle } from '@/lib/fall/field-permissions'

export function getKanaeleForRolle(rolle: FallakteRolle): ChatKanal[] {
  if (rolle === 'admin' || rolle === 'kundenbetreuer') {
    return ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv', 'chat_kb_sv']
  }
  if (rolle === 'sachverstaendiger') {
    return ['gruppenchat', 'chat_kunde_sv', 'chat_kb_sv']
  }
  if (rolle === 'kunde') {
    return ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv']
  }
  return []
}

// Mapping zwischen den Kanal-Aliasen aus dem AAR-541-Ticket (deutlich
// kürzere Form) und den Schema-IDs in nachrichten.kanal. Wird für den
// URL-Parameter `?kanal=...` genutzt.
const ALIAS_TO_ID: Record<string, ChatKanal> = {
  whatsapp: 'whatsapp',
  kb_kunde: 'chat_kb_kunde',
  gruppe: 'gruppenchat',
  gruppenchat: 'gruppenchat',
  kunde_sv: 'chat_kunde_sv',
  kb_sv_intern: 'chat_kb_sv',
  intern: 'chat_kb_sv',
  chat_kb_kunde: 'chat_kb_kunde',
  chat_kunde_sv: 'chat_kunde_sv',
  chat_kb_sv: 'chat_kb_sv',
}

export function resolveKanalAlias(raw: string | null | undefined): ChatKanal | null {
  if (!raw) return null
  return ALIAS_TO_ID[raw.toLowerCase()] ?? null
}
