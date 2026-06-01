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

// SSoT (2026-06-01): Inbox-/Triage-Sicht je Rolle. EINZIGE Quelle fuer die Frage
// "welche Kanaele zeigt die Inbox/der Posteingang?". Ersetzt die frueher an 6
// Stellen duplizierten Whitelists (VISIBLE_KANAELE in /admin/nachrichten,
// KB_KANAELE in /mitarbeiter/nachrichten, svKanaele in /gutachter/posteingang,
// KUNDE_KANAELE in /kunde/chat, ADMIN/SV/KUNDE_KANAELE in der inbox-threads-API).
//
// Unterschied zu getKanaeleForRolle (Fallakte-"Decke"): Die Inbox ist eine
// Triage-Sicht, die je Rolle bewusst Kanaele ausblendet — z. B. sieht der KB den
// Kunde-SV-Chat nur in der Fallakte, nicht in der Inbox; das Kunde-UI hat keinen
// WhatsApp-Tab (Kunde nutzt WhatsApp ausserhalb der App).
export function getInboxKanaele(
  rolle: FallakteRolle | string | null | undefined,
): ChatKanal[] {
  switch (rolle) {
    case 'admin':
    case 'dispatch':
      return ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kunde_sv']
    case 'kundenbetreuer':
      return ['whatsapp', 'chat_kb_kunde', 'gruppenchat', 'chat_kb_sv']
    case 'sachverstaendiger':
      return ['whatsapp', 'chat_kunde_sv', 'gruppenchat']
    case 'kunde':
      return ['chat_kb_kunde', 'chat_kunde_sv', 'gruppenchat']
    case 'makler':
      return ['gruppenchat', 'chat_gruppe_mit_makler']
    default:
      return []
  }
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
