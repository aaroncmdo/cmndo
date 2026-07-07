'use server'

// Admin-Server-Actions fuer die Werkstatt-Detailseite: Stammdaten bearbeiten +
// Status aendern/sperren. Getrennt von WerkstaettenClients actions.ts (Kollisions-
// Vermeidung). admin-gated, Writes via service-role (createAdminClient), Result-Object.
// Bewusst NICHT hier: Email-Aenderung (Auth-User-Email = komplex) + Adresse
// (Geocode/Isochrone-Neuberechnung) -> spaeterer Slice.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { calculateIsochrone } from '@/lib/isochrone/calculate-isochrone'

async function requireAdmin(): Promise<boolean> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return false
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  return p?.rolle === 'admin'
}

export interface WerkstattStammdatenPatch {
  name: string
  telefon: string | null
  ansprechpartner_name: string | null
  website: string | null
  provision_betrag_netto: number
  provision_aktiv: boolean
  bank_iban: string | null
  bank_bic: string | null
  bank_kontoinhaber: string | null
}

export async function aktualisiereWerkstattStammdaten(
  werkstattId: string,
  patch: WerkstattStammdatenPatch,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen Werkstätten bearbeiten.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }

  const name = (patch.name ?? '').trim()
  if (!name) return { ok: false, error: 'Name ist ein Pflichtfeld.' }
  const provision = Number(patch.provision_betrag_netto)
  if (!Number.isFinite(provision) || provision < 0) {
    return { ok: false, error: 'Provision muss 0 oder größer sein.' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('werkstaetten')
    .update({
      name,
      normalized_name: name.toLowerCase().replace(/\s+/g, ' ').trim(),
      telefon: patch.telefon?.trim() || null,
      ansprechpartner_name: patch.ansprechpartner_name?.trim() || null,
      website: patch.website?.trim() || null,
      provision_betrag_netto: provision,
      provision_aktiv: !!patch.provision_aktiv,
      bank_iban: patch.bank_iban?.trim() || null,
      bank_bic: patch.bank_bic?.trim() || null,
      bank_kontoinhaber: patch.bank_kontoinhaber?.trim() || null,
    })
    .eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/werkstaetten/${werkstattId}`)
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

export type WerkstattStatus = 'aktiv' | 'inaktiv' | 'gesperrt'

export async function setzeWerkstattStatus(
  werkstattId: string,
  status: WerkstattStatus,
  grund?: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen den Status ändern.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }
  if (status !== 'aktiv' && status !== 'inaktiv' && status !== 'gesperrt') {
    return { ok: false, error: 'Ungültiger Status.' }
  }
  const g = (grund ?? '').trim()
  if (status === 'gesperrt' && !g) return { ok: false, error: 'Bitte einen Sperr-Grund angeben.' }

  const admin = createAdminClient()
  const patch =
    status === 'gesperrt'
      ? { status, gesperrt_am: new Date().toISOString(), gesperrt_grund: g }
      : { status, gesperrt_am: null, gesperrt_grund: null }
  const { error } = await admin.from('werkstaetten').update(patch).eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }

  revalidatePath(`/admin/werkstaetten/${werkstattId}`)
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

/**
 * Aendert die (Login-)E-Mail 3-schichtig konsistent: auth.users (Login-Identitaet, via
 * updateUserById+email_confirm) ZUERST — schlaegt sie fehl (z.B. Unique-Kollision), wird
 * nichts weiter geaendert (fail-closed) — dann profiles.email + werkstaetten.email.
 */
export async function aktualisiereWerkstattEmail(
  werkstattId: string,
  neueEmail: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen die E-Mail ändern.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }
  const email = (neueEmail ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Ungültige E-Mail-Adresse.' }

  const admin = createAdminClient()
  const { data: w, error: wErr } = await admin
    .from('werkstaetten')
    .select('user_id')
    .eq('id', werkstattId)
    .maybeSingle()
  if (wErr || !w) return { ok: false, error: wErr?.message ?? 'Werkstatt nicht gefunden.' }

  if (w.user_id) {
    const { error: authErr } = await admin.auth.admin.updateUserById(w.user_id as string, {
      email,
      email_confirm: true,
    })
    if (authErr) return { ok: false, error: `Login-E-Mail konnte nicht geändert werden: ${authErr.message}` }
    await admin.from('profiles').update({ email }).eq('id', w.user_id as string)
  }
  const { error: updErr } = await admin.from('werkstaetten').update({ email }).eq('id', werkstattId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/admin/werkstaetten/${werkstattId}`)
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}

export interface WerkstattAdressePatch {
  adresse_strasse: string
  adresse_plz: string
  adresse_ort: string
  lat: number
  lng: number
}

/**
 * Aendert die Adresse + Koordinaten und berechnet die Isochrone (30-Min-Fahrgebiet) neu —
 * spiegelt createWerkstatt. lat/lng kommen aus GooglePlaceAutocomplete (Client). Isochrone
 * ist defensiv/non-fatal (die Adresse ist schon gespeichert).
 */
export async function aktualisiereWerkstattAdresse(
  werkstattId: string,
  patch: WerkstattAdressePatch,
): Promise<{ ok: boolean; error?: string }> {
  if (!(await requireAdmin())) return { ok: false, error: 'Nur Admins dürfen die Adresse ändern.' }
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt-ID.' }
  const lat = Number(patch.lat)
  const lng = Number(patch.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Bitte eine Adresse aus den Vorschlägen wählen (Standort fehlt).' }
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('werkstaetten')
    .update({
      adresse_strasse: patch.adresse_strasse?.trim() || null,
      adresse_plz: patch.adresse_plz?.trim() || null,
      adresse_ort: patch.adresse_ort?.trim() || null,
      lat,
      lng,
    })
    .eq('id', werkstattId)
  if (error) return { ok: false, error: error.message }

  // Isochrone defensiv neu berechnen (non-fatal, wie createWerkstatt).
  try {
    const points = await calculateIsochrone(lat, lng, 30)
    if (points.length >= 3) {
      const ring = points.map((p) => [p.lng, p.lat])
      const first = ring[0]
      const last = ring[ring.length - 1]
      if (first[0] !== last[0] || first[1] !== last[1]) ring.push([first[0], first[1]])
      await admin
        .from('werkstaetten')
        .update({ isochrone: { type: 'Polygon', coordinates: [ring] } })
        .eq('id', werkstattId)
    }
  } catch (err) {
    console.error('[werkstatt-detail] Isochrone-Neuberechnung fehlgeschlagen (non-fatal):', err)
  }

  revalidatePath(`/admin/werkstaetten/${werkstattId}`)
  revalidatePath('/admin/werkstaetten')
  return { ok: true }
}
