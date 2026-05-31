'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type WartelistePayload = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  plz: string
  ort?: string
  lat?: number
  lng?: number
  qualifikationen?: string[]
  dat_expert_nr?: string
  bvsk_nr?: string
  ihk_zertifikat?: boolean
  oebuv_nr?: string
  firma?: string
  jahre_erfahrung?: number
  auftraege_monat?: number
  fachschwerpunkte?: string
  radius_km?: number
}

export async function eintragenAufWarteliste(
  payload: WartelistePayload,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = createAdminClient()

  // Duplikat-Check per E-Mail
  const { data: existing } = await supabase
    .from('sv_leads')
    .select('id')
    .eq('email', payload.email.trim().toLowerCase())
    .maybeSingle()

  if (existing) {
    return { ok: false, error: 'Diese E-Mail-Adresse ist bereits auf der Warteliste eingetragen.' }
  }

  const { error } = await supabase.from('sv_leads').insert({
    vorname: payload.vorname.trim(),
    nachname: payload.nachname.trim(),
    name: `${payload.nachname.trim()}, ${payload.vorname.trim()}`,
    email: payload.email.trim().toLowerCase(),
    telefon: payload.telefon?.trim() || null,
    plz: payload.plz.trim(),
    ort: payload.ort?.trim() || null,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    qualifikationen: payload.qualifikationen ?? [],
    dat_expert_nr: payload.dat_expert_nr?.trim() || null,
    bvsk_nr: payload.bvsk_nr?.trim() || null,
    ihk_zertifikat: payload.ihk_zertifikat ?? false,
    oebuv_nr: payload.oebuv_nr?.trim() || null,
    firma: payload.firma?.trim() || null,
    jahre_erfahrung: payload.jahre_erfahrung ?? null,
    auftraege_monat: payload.auftraege_monat ?? null,
    fachschwerpunkte: payload.fachschwerpunkte?.trim() || null,
    radius_km: payload.radius_km ?? 30,
    quelle: 'gutachter-partner-page',
    ist_aktiv: false,
    warteliste_status: 'ausstehend',
    warteliste_am: new Date().toISOString(),
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner/waitlist')
  return { ok: true }
}
