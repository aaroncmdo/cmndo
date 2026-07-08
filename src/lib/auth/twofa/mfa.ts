'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefe2faSperre, registriere2faVerify } from './verify-rate-limit'
import { toE164 } from '@/lib/format/telefon'

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

export type TotpEnroll = { factorId: string; qrCode: string; secret: string }

/**
 * AAR-939 TOTP: Authenticator-App-Faktor anlegen. Liefert den QR-Code (data:svg,
 * von Supabase fertig gerendert) + das Secret (manuelle Eingabe). KEIN Challenge
 * hier — der QR wird angezeigt, dann bestaetigt der User per challengePhoneFaktor
 * + verifyPhoneFaktor (beide factorId-generisch, s.u.). Stale unverifizierte
 * TOTP-Faktoren (abgebrochene Versuche) werden vorher aufgeraeumt.
 */
export async function enrolleTotpFaktor(): Promise<MfaResult<TotpEnroll>> {
  const supabase = await createClient()
  const { data: liste } = await supabase.auth.mfa.listFactors()
  const stale = (liste?.all ?? []).filter(
    (f) => f.status === 'unverified' && f.factor_type === 'totp',
  )
  for (const f of stale) {
    await supabase.auth.mfa.unenroll({ factorId: f.id })
  }
  const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp' })
  if (error || !data || data.type !== 'totp') {
    return { ok: false, error: uebersetzeMfaFehler(error?.message) }
  }
  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret }
}

/**
 * Challenge fuer einen bestehenden Faktor. FACTORID-GENERISCH: fuer Phone loest
 * es die SMS aus, fuer TOTP erzeugt es nur die Challenge (der Code kommt aus der
 * App). Dient dem Login + dem "Code erneut senden" (nur SMS).
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
 * Verify: bestaetigt eine Enroll- ODER Login-Challenge (Phone ODER TOTP —
 * factorId-generisch). Bei Erfolg hebt Supabase die Session auf aal2 — danach
 * laesst das Middleware-Gate durch.
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

  // AAR-auth-haertung (Befund H): App-seitiges Lockout gegen Code-Brute-Force,
  // Defense-in-depth ueber GoTrues Provider-Rate-Limit. FAIL-OPEN — ein
  // Limiter-Fehler darf den Login NIE blockieren.
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (user) {
    try {
      const sperre = await pruefe2faSperre(createAdminClient(), user.id)
      if (sperre.gesperrt) {
        return {
          ok: false,
          error: 'Zu viele Fehlversuche. Bitte in einigen Minuten erneut versuchen.',
        }
      }
    } catch (err) {
      console.error('[AAR-939] 2FA-Sperre-Check fehlgeschlagen (fail-open):', err)
    }
  }

  const { error } = await supabase.auth.mfa.verify({ factorId, challengeId, code: sauber })

  if (user) {
    try {
      await registriere2faVerify(createAdminClient(), user.id, !error)
    } catch (err) {
      console.error('[AAR-939] 2FA-Versuch-Verbuchung fehlgeschlagen (fail-open):', err)
    }
  }

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

export type Faktor = {
  id: string
  type: 'phone' | 'totp' | 'webauthn'
  status: 'verified' | 'unverified'
  friendlyName: string | null
}

/** Generische Faktor-Liste (Phone + TOTP) fuer Login-Routing + Faktor-Manager. */
export async function listeFaktoren(): Promise<MfaResult<{ faktoren: Faktor[] }>> {
  const supabase = await createClient()
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error || !data) {
    return { ok: false, error: uebersetzeMfaFehler(error?.message) }
  }
  const faktoren: Faktor[] = (data.all ?? []).map((f) => ({
    id: f.id,
    type: f.factor_type as 'phone' | 'totp' | 'webauthn',
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

  // AAR-2fa-optional (B2): die verifizierte Nummer auch nach auth.users.phone
  // spiegeln (E164) -> ermoeglicht passwordless Telefon-Login (signInWithOtp
  // loest gegen auth.users.phone auf, nicht gegen profiles.telefon). Best-effort +
  // uniqueness-safe: auth.users.phone ist UNIQUE -> bei Kollision (Nummer schon
  // auf einem anderen Konto) still ueberspringen; 2FA + Anzeige bleiben intakt
  // (nur der Login-per-Nummer ist fuer dieses Konto dann nicht aktivierbar).
  try {
    const e164 = toE164(phone)
    if (e164) {
      const { error: phoneErr } = await admin.auth.admin.updateUserById(user.id, {
        phone: e164,
        phone_confirm: true,
      })
      if (phoneErr) {
        console.warn(
          '[B2] auth.users.phone-Sync uebersprungen (evtl. Nummer bereits vergeben):',
          phoneErr.message,
        )
      }
    }
  } catch (err) {
    console.warn('[B2] auth.users.phone-Sync Ausnahme (non-critical):', err)
  }

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
