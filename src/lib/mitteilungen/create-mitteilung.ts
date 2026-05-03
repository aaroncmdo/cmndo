// AAR-229 W2: Server-Helper zum Erstellen von Mitteilungen.
// Nutzt Admin-Client (Service Role) damit der Insert unabhängig vom
// eingeloggten User funktioniert (RLS-Policy erlaubt INSERT für alle).
//
// AAR-720: autoRouteUrl nutzt jetzt die zentrale roleToPath-Funktion
// als Prefix-Quelle — vorher war hier ein eigenes Mapping dupliziert
// (same Anti-Pattern wie in AAR-718 für Auth-Redirects).

import { createAdminClient } from '@/lib/supabase/admin'
import { roleToPath } from '@/lib/auth/role-redirect'
import type { CreateMitteilungInput, EmpfaengerRolle, KontextTyp, MitteilungKategorie } from './types'

// F-08 / AAR-720: Route-URL Auto-Generation basierend auf Kontext + Rolle.
// Fall-Detail-Route ist rolle-spezifisch:
//   - sachverstaendiger → /gutachter/fall/{id}
//   - kunde             → /kunde/faelle/{id}
//   - makler            → /makler/akten/{id}
//   - admin/kb/kanzlei  → /faelle/{id} (geteilte Fallakte)
function autoRouteUrl(
  kontextTyp: KontextTyp | undefined,
  kontextId: string | undefined,
  rolle: EmpfaengerRolle,
): string | null {
  if (!kontextTyp || !kontextId) return null

  // Portal-Base-Pfad über zentrale Quelle.
  const portalBase = roleToPath(rolle)

  switch (kontextTyp) {
    case 'fall':
      if (rolle === 'sachverstaendiger') return `/gutachter/fall/${kontextId}`
      if (rolle === 'kunde') return `/kunde/faelle/${kontextId}`
      if (rolle === 'makler') return `/makler/akten/${kontextId}`
      // admin / kundenbetreuer / dispatch / kanzlei → geteilte Fallakte
      return `/faelle/${kontextId}`
    case 'lead':
      if (rolle === 'dispatch') return `/dispatch/leads/${kontextId}`
      if (rolle === 'makler') return `/makler/leads/${kontextId}`
      return '/admin/faelle'
    case 'auftrag':
      if (rolle === 'sachverstaendiger') return `${portalBase}/auftraege`
      if (rolle === 'makler') return `${portalBase}/akten`
      return `${portalBase}/faelle`
    case 'termin':
      if (rolle === 'sachverstaendiger') return `${portalBase}/kalender`
      if (rolle === 'kunde') return `${portalBase}/termin`
      return null
    case 'abrechnung':
      if (rolle === 'sachverstaendiger') return `${portalBase}/abrechnung`
      if (rolle === 'makler') return `${portalBase}/promo`
      return null
    case 'nachricht':
      // Für alle Portale mit Nachrichten-Inbox.
      if (rolle === 'sachverstaendiger') return '/gutachter/posteingang'
      if (rolle === 'kunde') return '/kunde/chat'
      if (rolle === 'kundenbetreuer' || rolle === 'dispatch') return '/mitarbeiter/nachrichten'
      if (rolle === 'admin') return '/admin/nachrichten'
      return null
    default:
      return null
  }
}

// F-07: Icon Auto-Setzung basierend auf Kategorie + Kontext.
function autoIcon(kategorie: MitteilungKategorie, kontextTyp?: KontextTyp): string {
  if (kategorie === 'anruf') return '📞'
  if (kategorie === 'nachricht') return '💬'
  if (kategorie === 'task') return '📌'
  if (kontextTyp === 'fall') return '📁'
  if (kontextTyp === 'lead') return '📋'
  if (kontextTyp === 'termin') return '📅'
  if (kontextTyp === 'abrechnung') return '💶'
  return '🔔'
}

// Mitteilungs-System für Go-Live deaktiviert — wird nach Launch reaktiviert.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createMitteilung(_input: CreateMitteilungInput): Promise<{ id: string } | null> {
  return null
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function createMitteilungMulti(
  _empfaenger: Array<{ id: string; rolle: EmpfaengerRolle }>,
  _base: Omit<CreateMitteilungInput, 'empfaenger_id' | 'empfaenger_rolle'>,
): Promise<void> {
  // no-op
}
