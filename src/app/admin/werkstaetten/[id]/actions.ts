'use server'

// Admin-Server-Actions fuer die Werkstatt-Detailseite: Stammdaten bearbeiten +
// Status aendern/sperren. Getrennt von WerkstaettenClients actions.ts (Kollisions-
// Vermeidung). admin-gated, Writes via service-role (createAdminClient), Result-Object.
// Bewusst NICHT hier: Email-Aenderung (Auth-User-Email = komplex) + Adresse
// (Geocode/Isochrone-Neuberechnung) -> spaeterer Slice.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

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
