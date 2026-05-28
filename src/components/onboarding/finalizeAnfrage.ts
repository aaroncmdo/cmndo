'use server'

import { konvertiereAnfrageZuFall } from '@/lib/actions/konvertiere-anfrage-zu-fall'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'

// Wird vom WizardClient nach Abschluss der letzten Phase aufgerufen.
// Triggert die Konvertierung der gutachter_finder_anfragen-Zeile in
// einen vollwertigen Lead/Fall inklusive Kunden-Account + Magic-Link.
//
// Idempotent: konvertiereAnfrageZuFall hat einen eigenen Idempotenz-Check
// via anfrage.konvertiert_zu_fall_id — Doppel-Trigger ist safe.
export async function finalizeGutachterFinderAnfrage(
  anfrageId: string,
): Promise<{ ok: true; fallId: string } | { ok: false; error: string }> {
  if (!anfrageId) return { ok: false, error: 'anfrage_id fehlt' }

  // Track B (Doc 48): Wizard-Cookie-Locale erfassen -> leads.sprache (i18n-Notifications).
  const locale = await getLocaleCookie()
  const result = await konvertiereAnfrageZuFall(anfrageId, locale)
  if (!result.ok) return { ok: false, error: result.error }

  return { ok: true, fallId: result.fallId }
}
