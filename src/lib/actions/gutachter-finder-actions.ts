'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type SvLead = {
  id: string
  name: string
  vorname: string | null
  firma: string | null
  adresse: string
  plz: string | null
  ort: string | null
  lat: number
  lng: number
  telefon: string | null
  email: string | null
}

export type AktiverSV = {
  id: string
  firmenname: string | null
  standort_lat: number | null
  standort_lng: number | null
  isochrone_polygon: unknown
  paket: string
}

export type GutachterFinderPayload = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  kennzeichen?: string
  fahrzeug_beschreibung?: string
  schadentyp: string
  schadenort?: string
  schadenort_lat?: number
  schadenort_lng?: number
  wunschtermin?: string
  zugeordneter_sv_id?: string
  zugeordneter_sv_lead_id?: string
  matching_typ?: string
  sa_signatur_data_url?: string
  // Z35-Wahl: vollstaendig (Anwalt + alle Positionen) vs. nur_gutachten (Selbst-Regulierung)
  regulierungs_modus?: 'vollstaendig' | 'nur_gutachten'
}

export async function ladeSvLeads(): Promise<{ ok: true; data: SvLead[] } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_leads')
    .select('id,name,vorname,firma,adresse,plz,ort,lat,lng,telefon,email')
    .eq('ist_aktiv', true)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as SvLead[] }
}

export async function ladeAktiveSVs(): Promise<{ ok: true; data: AktiverSV[] } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sachverstaendige')
    .select('id,firmenname,standort_lat,standort_lng,isochrone_polygon,paket')
    .eq('ist_aktiv', true)
    .not('isochrone_polygon', 'is', null)
    .not('standort_lat', 'is', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as AktiverSV[] }
}

export async function erstelleGutachterFinderAnfrage(
  payload: GutachterFinderPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from('gutachter_finder_anfragen')
    .insert({
      vorname: payload.vorname,
      nachname: payload.nachname,
      email: payload.email,
      telefon: payload.telefon ?? null,
      kennzeichen: payload.kennzeichen ?? null,
      fahrzeug_beschreibung: payload.fahrzeug_beschreibung ?? null,
      schadentyp: payload.schadentyp,
      schadenort: payload.schadenort ?? null,
      schadenort_lat: payload.schadenort_lat ?? null,
      schadenort_lng: payload.schadenort_lng ?? null,
      wunschtermin: payload.wunschtermin ?? null,
      zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
      zugeordneter_sv_lead_id: payload.zugeordneter_sv_lead_id ?? null,
      matching_typ: payload.matching_typ ?? null,
      sa_signatur_data_url: payload.sa_signatur_data_url ?? null,
      sa_unterzeichnet_am: payload.sa_signatur_data_url ? new Date().toISOString() : null,
      regulierungs_modus: payload.regulierungs_modus ?? null,
      status: 'neu',
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  const anfrageId = data.id

  // Dispatch-Task: alle dispatch/admin-User informieren dass ein SV angerufen werden muss
  try {
    const admin = createAdminClient()

    // SV-Name ermitteln für den Task-Text
    let svName = 'Unbekannt'
    let svTelefon: string | null = null

    if (payload.zugeordneter_sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('firmenname, profiles(anzeigename, telefon)')
        .eq('id', payload.zugeordneter_sv_id)
        .single()
      if (sv) {
        const profil = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
        svName = sv.firmenname ?? (profil as { anzeigename?: string } | null)?.anzeigename ?? 'SV'
        svTelefon = (profil as { telefon?: string } | null)?.telefon ?? null
      }
    } else if (payload.zugeordneter_sv_lead_id) {
      const { data: lead } = await admin
        .from('sv_leads')
        .select('name, telefon')
        .eq('id', payload.zugeordneter_sv_lead_id)
        .single()
      if (lead) {
        svName = lead.name
        svTelefon = lead.telefon
      }
    }

    const wunschterminText = payload.wunschtermin
      ? new Date(payload.wunschtermin).toLocaleString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : 'kein Termin'

    const taskInhalt = [
      `Kunde: ${payload.vorname} ${payload.nachname}`,
      `Schaden: ${payload.schadentyp}`,
      `Wunschtermin: ${wunschterminText}`,
      svTelefon ? `SV-Tel.: ${svTelefon}` : null,
      payload.sa_signatur_data_url ? '✓ SA unterzeichnet' : '⚠ SA noch nicht unterzeichnet',
    ]
      .filter(Boolean)
      .join(' · ')

    // Alle Dispatch-User laden und Task-Mitteilung senden
    const { data: dispatchUser } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')

    const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
      empfaenger_id: u.id,
      empfaenger_rolle: 'dispatch' as const,
      kategorie: 'anruf' as const,
      titel: `SV anrufen: ${svName} — Gutachter-Finder Buchung`,
      inhalt: taskInhalt,
      kontext_typ: null,
      kontext_id: null,
      route_url: `/dispatch/gutachter-finder/${anfrageId}`,
      prioritaet: 'hoch' as const,
      icon: '📞',
    }))

    if (mitteilungen.length > 0) {
      await admin.from('mitteilungen').insert(mitteilungen)
    }
  } catch (taskErr) {
    console.error('[GutachterFinder] Dispatch-Task fehlgeschlagen:', taskErr)
  }

  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/dashboard')
  return { ok: true, id: anfrageId }
}
