'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

// AAR-939: Duenne Wrapper um supabase.auth.mfa (Phone-Faktor). Result-Object-
// Pattern (kein throw) — siehe AGENTS.md §Server-Actions. Die SMS-Zustellung
// laeuft ueber den in Supabase-Auth konfigurierten Twilio-Messaging-Provider;
// Code-Generierung, Rate-Limit und Verify macht Supabase selbst.
//
// Ablauf laut auth-js: enroll(phone) legt einen UNVERIFIZIERTEN Faktor an
// (sendet NOCH kein SMS) -> challenge(factorId) loest die SMS aus -> verify
// hebt die Session auf aal2 (der SSR-Cookie-Adapter schreibt die neuen Cookies).

export type MfaResult<T = Record<string, unknown>> =
  | ({ ok: true } & T)
  | { ok: false; error: string }

export type PhoneFaktor = {
  id: string
  status: 'verified' | 'unverified'
  friendlyName: string | null
}

/**
 * Enroll + sofortige Challenge: legt einen Phone-Faktor an und schickt die
 * erste SMS. Stale unverifizierte Phone-Faktoren (abgebrochene Versuche) werden
 * vorher entfernt, damit kein "factor already exists" geworfen wird.
 */
export async function enrollePhoneFaktor(
  phone: string,
): Promise<MfaResult<{ factorId: string; challengeId: string }>> {
  const supabase = await createClient()

  const { data: liste } = await supabase.auth.mfa.listFactors()
  const stale = (liste?.all ?? []).filter(
    (f) => f.status === 'unverified' && f.factor_type === 'phone',
  )
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id })
  }

  const { data: enrollData, error: enrollError } = await supabase.auth.mfa.enroll({
    factorType: 'phone',
    phone,
  })
  if (enrollError || !enrollData) {
    return { ok: false, error: uebersetzeMfaFehler(enrollError?.message) }
  }

  const { data: challengeData, error: challengeError } =
    await supabase.auth.mfa.challenge({ factorId: enrollData.id })
  if (challengeError || !challengeData) {
    // Halb-angelegten Faktor wieder entfernen, damit der naechste Versuch sauber ist.
    await supabase.auth.mfa.unenroll({ factorId: enrollData.id })
    return { ok: false, error: uebersetzeMfaFehler(challengeError?.message) }
  }

  return { ok: true, factorId: enrollData.id, challengeId: challengeData.id }
}

/**
 * Challenge fuer einen bestehenden Faktor — loest beim Login die SMS aus, und
 * dient auch dem "Code erneut senden".
 */
export async function challengePhoneFaktor(
  factorId: string,
): Promise<MfaResult<{ challengeId: string }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.challenge({ factorId })
  if (error || !data) {
    return { ok: false, error: uebersetzeMfaFehler(error?.message) }
  }
  return { ok: true, challengeId: data.id }
}

/**
 * Verify: bestaetigt eine Enroll- ODER Login-Challenge. Bei Erfolg hebt Supabase
 * die Session auf aal2 — danach laesst das Middleware-Gate durch.
 */
export async function verifyPhoneFaktor(
  factorId: string,
  challengeId: string,
  code: string,
): Promise<MfaResult> {
  const supabase = await createClient()
  const sauber = code.replace(/\D/g, '').slice(0, 6)
  if (sauber.length !== 6) {
    return { ok: false, error: 'Bitte den 6-stelligen Code eingeben' }
  }
  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: sauber })
  if (error) {
    return { ok: false, error: uebersetzeMfaFehler(error.message) }
  }
  return { ok: true }
}

/** Faktor-Liste (Phone) fuer Login-Routing + Einstellungen. */
export async function listePhoneFaktoren(): Promise<MfaResult<{ faktoren: PhoneFaktor[] }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) {
    return { ok: false, error: uebersetzeMfaFehler(error?.message) }
  }
  const faktoren: PhoneFaktor[] = (data.all ?? [])
    .filter((f) => f.factor_type === 'phone')
    .map((f) => ({
      id: f.id,
      status: f.status === 'verified' ? 'verified' : 'unverified',
      friendlyName: f.friendly_name ?? null,
    }))
  return { ok: true, faktoren }
}

/** Faktor entfernen — Einstellungen / Nummer aendern (= alt entfernen + neu enrollen). */
export async function entferneFaktor(factorId: string): Promise<MfaResult> {
  const supabase = await createClient()
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) {
    return { ok: false, error: uebersetzeMfaFehler(error.message) }
  }
  return { ok: true }
}

/**
 * Entfernt alle Phone-Faktoren AUSSER dem angegebenen — für den "Nummer ändern"-
 * Flow (neuer Faktor verifiziert -> alten wegräumen). Ein verifizierter Faktor
 * reicht für aal2; mehrere parallele Nummern wollen wir nicht.
 */
export async function entferneAndereFaktoren(behalteFactorId: string): Promise<MfaResult> {
  const supabase = await createClient()
  const { data } = await supabase.auth.mfa.listFactors()
  const andere = (data?.all ?? []).filter(
    (f) => f.factor_type === 'phone' && f.id !== behalteFactorId,
  )
  for (const f of andere) {
    await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  return { ok: true }
}

/**
 * Spiegelt die enrollte Nummer in profiles.twofa_telefon (+ Legacy-Flag), damit
 * die Anzeige in den Einstellungen (TwoFaPhoneChange) korrekt bleibt. Quelle der
 * Wahrheit fuer 2FA ist auth.mfa_factors — das hier ist reine Anzeige-Kohaerenz.
 */
export async function merkeTwofaTelefon(phone: string): Promise<MfaResult> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('profiles')
    .update({
      twofa_telefon: phone,
      twofa_telefon_verifiziert_am: new Date().toISOString(),
      twofa_aktiviert: true,
    })
    .eq('id', user.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Lokaler Helfer (NICHT exportiert — 'use server'-Files duerfen nur async
// Funktionen exportieren). Mappt die englischen GoTrue-Meldungen auf deutsche
// UI-Texte; Unbekanntes wird geloggt + generisch uebersetzt.
function uebersetzeMfaFehler(message: string | undefined | null): string {
  const m = (message ?? '').toLowerCase()
  if (!m) return 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.'
  if (m.includes('invalid') && (m.includes('code') || m.includes('otp') || m.includes('totp'))) {
    return 'Ungültiger oder abgelaufener Code.'
  }
  if (m.includes('expired')) return 'Der Code ist abgelaufen. Bitte einen neuen anfordern.'
  if (m.includes('rate') || m.includes('too many') || m.includes('limit')) {
    return 'Zu viele Versuche. Bitte später erneut versuchen.'
  }
  if (m.includes('not enabled') || m.includes('disabled') || m.includes('not configured')) {
    return 'SMS-2FA ist gerade nicht verfügbar. Bitte Administrator kontaktieren.'
  }
  if (m.includes('already exists')) {
    return 'Für diese Nummer existiert bereits ein Faktor.'
  }
  console.error('[AAR-939] Unbekannter MFA-Fehler:', message)
  return 'Der Code konnte nicht verarbeitet werden. Bitte erneut versuchen.'
}
