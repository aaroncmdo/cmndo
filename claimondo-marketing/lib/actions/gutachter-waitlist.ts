'use server'

// Gutachter-Waitlist — eingehende Bewerbungen über gutachter.claimondo.de.
//
// Public-Form-Submit: Bewerber ist NICHT eingeloggt, deshalb Service-Role-
// Client. RLS auf gutachter_waitlist erlaubt nur Admin-Reads/Writes —
// daher MUSS dieser Insert über Admin-Client laufen.
//
// Geocoding über Mapbox-Forward-API (pk-Token reicht, Server-side aber via
// secret-Token besser für Quota-Tracking — fallback auf NEXT_PUBLIC_).

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import crypto from 'node:crypto'

type SubmitInput = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  plz: string
  unternehmen?: string
  dat_expert_nummer?: string
  bvsk_mitgliedsnummer?: string
  ihk_zertifikat_nummer?: string
  oebuv_bestellungsnummer?: string
  jahre_erfahrung?: number
  aktuelle_auftraege_pro_monat?: number
  schwerpunkte?: string
  honeypot?: string
  user_agent?: string
  ip?: string
}

type Result =
  | { ok: true; id: string }
  | { ok: false; error: string }

async function geocodePlz(plz: string): Promise<{ lat: number; lng: number; ort: string | null } | null> {
  const token =
    process.env.MAPBOX_SECRET_TOKEN ?? process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  if (!token) return null
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(plz)}.json?country=de&limit=1&types=postcode&access_token=${token}`
    const res = await fetch(url, { signal: AbortSignal.timeout(4000) })
    if (!res.ok) return null
    const data = await res.json()
    const feature = data?.features?.[0]
    if (!feature?.center) return null
    const [lng, lat] = feature.center
    const ort =
      feature.context?.find((c: { id?: string }) => c.id?.startsWith('place'))?.text ??
      feature.place_name?.split(',')[1]?.trim() ??
      null
    return { lat, lng, ort }
  } catch {
    return null
  }
}

export async function stelleWaitlistAnfrage(input: SubmitInput): Promise<Result> {
  // Honeypot: gefülltes Hidden-Field = Bot
  if (input.honeypot && input.honeypot.length > 0) {
    return { ok: true, id: 'honeypot-noop' }
  }

  // Validierung
  if (!input.vorname?.trim()) return { ok: false, error: 'Vorname fehlt' }
  if (!input.nachname?.trim()) return { ok: false, error: 'Nachname fehlt' }
  if (!input.email?.match(/^[^@\s]+@[^@\s]+\.[^@\s]+$/)) {
    return { ok: false, error: 'E-Mail ungültig' }
  }
  if (!input.plz?.match(/^[0-9]{5}$/)) {
    return { ok: false, error: 'PLZ muss 5 Ziffern haben' }
  }

  const admin = createAdminClient()

  // Doppel-Eintrag: gleiche Email + Status nicht 'aktiv' → bestehenden Eintrag
  // updaten statt neuen anzulegen
  const { data: bestehend } = await admin
    .from('gutachter_waitlist')
    .select('id, status')
    .eq('email', input.email.toLowerCase().trim())
    .maybeSingle()

  if (bestehend && bestehend.status !== 'aktiv' && bestehend.status !== 'abgelehnt') {
    return { ok: false, error: 'Eine Bewerbung mit dieser E-Mail liegt bereits vor — wir melden uns in Kürze.' }
  }

  const geo = await geocodePlz(input.plz)

  const ipHash = input.ip
    ? crypto.createHash('sha256').update(input.ip).digest('hex').slice(0, 32)
    : null

  const { data, error } = await admin
    .from('gutachter_waitlist')
    .insert({
      vorname: input.vorname.trim(),
      nachname: input.nachname.trim(),
      email: input.email.toLowerCase().trim(),
      telefon: input.telefon?.trim() || null,
      plz: input.plz.trim(),
      ort: geo?.ort ?? null,
      standort_lat: geo?.lat ?? null,
      standort_lng: geo?.lng ?? null,
      dat_expert_nummer: input.dat_expert_nummer?.trim() || null,
      bvsk_mitgliedsnummer: input.bvsk_mitgliedsnummer?.trim() || null,
      ihk_zertifikat_nummer: input.ihk_zertifikat_nummer?.trim() || null,
      oebuv_bestellungsnummer: input.oebuv_bestellungsnummer?.trim() || null,
      unternehmen: input.unternehmen?.trim() || null,
      jahre_erfahrung: input.jahre_erfahrung ?? null,
      aktuelle_auftraege_pro_monat: input.aktuelle_auftraege_pro_monat ?? null,
      schwerpunkte: input.schwerpunkte?.trim() || null,
      quelle: 'gutachter.claimondo.de',
      user_agent: input.user_agent ?? null,
      ip_hash: ipHash,
    })
    .select('id')
    .single()

  if (error) {
    console.error('[gutachter-waitlist] insert error:', error.message)
    return { ok: false, error: 'Speichern fehlgeschlagen — bitte erneut versuchen.' }
  }

  // Admin-Benachrichtigung (best-effort, blockt nicht den Erfolgsfall)
  try {
    await admin.from('benachrichtigungen').insert({
      typ: 'update',
      titel: 'Neue Gutachter-Bewerbung',
      nachricht: `${input.vorname} ${input.nachname} (${input.plz}${geo?.ort ? ' ' + geo.ort : ''}) hat sich auf gutachter.claimondo.de eingetragen.`,
      link: `/admin/partner/waitlist/${data.id}`,
      empfaenger_rolle: 'admin',
    })
  } catch {
    // benachrichtigungen-Tabelle nicht kritisch
  }

  revalidatePath('/admin/partner/waitlist')

  return { ok: true, id: data.id }
}

// Admin-Aktionen — Status-Update + Notizen
export async function setzeWaitlistStatus(
  id: string,
  status: 'neu' | 'kontaktiert' | 'qualifiziert' | 'onboarding' | 'aktiv' | 'abgelehnt' | 'kein_interesse',
  notiz?: string,
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  // Caller-Auth-Check passiert in der Route via requireAdmin() — hier reine
  // Mutation, Auth-Guard schon davor.
  const { error } = await admin
    .from('gutachter_waitlist')
    .update({
      status,
      ...(notiz !== undefined ? { notizen_admin: notiz } : {}),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }
  revalidatePath('/admin/partner/waitlist')
  revalidatePath(`/admin/partner/waitlist/${id}`)
  return { ok: true }
}
