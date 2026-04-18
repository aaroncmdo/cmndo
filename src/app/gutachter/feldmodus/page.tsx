// AAR-382: Fokus-Modus — server-seitiger Data-Load.
// Lädt die aktive Tages-Session, Termine in Reihenfolge, Fall+Lead+Briefing,
// SV-Profil mit Avatar. Ohne Session → Redirect zum Heute-Tab.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGutachterForUser } from '@/lib/gutachter'
import { getTagesSession } from '@/lib/sv/tages-session'
import FeldmodusClient from './FeldmodusClient'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'

export const dynamic = 'force-dynamic'

export type FeldmodusStop = {
  termin_id: string
  fall_id: string
  index: number
  start_zeit: string
  status: string
  losgefahren_am: string | null
  sv_angekommen_am: string | null
  abschluss_zeit: string | null
  // Kunde
  kunde_name: string
  kunde_vorname: string | null
  kunde_telefon: string | null
  // Fall
  fall_nummer: string
  kennzeichen: string | null
  fahrzeug: string | null
  schadentyp: string | null
  // Adresse
  adresse: string
  place_id: string | null
  lat: number | null
  lng: number | null
  // Briefing
  briefing_text: string | null
  briefing_struktur: SvBriefingStruktur | null
}

export type FeldmodusSV = {
  id: string
  anzeigename: string
  avatar_url: string | null
  live_tracking_enabled: boolean
  standort_lat: number | null
  standort_lng: number | null
}

function normalizeStruktur(raw: unknown): SvBriefingStruktur | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  if (typeof r.kurzversion !== 'string') return null
  return {
    kurzversion: r.kurzversion,
    hinweise: Array.isArray(r.hinweise) ? (r.hinweise as string[]) : [],
    warnungen: Array.isArray(r.warnungen) ? (r.warnungen as string[]) : [],
    checkliste_vor_ort: Array.isArray(r.checkliste_vor_ort)
      ? (r.checkliste_vor_ort as string[])
      : [],
  }
}

export default async function FeldmodusPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const sv = await getGutachterForUser<{
    id: string
    live_tracking_enabled: boolean | null
    standort_lat: number | null
    standort_lng: number | null
  }>(
    supabase,
    user.id,
    'id, live_tracking_enabled, standort_lat, standort_lng',
  )
  if (!sv) redirect('/gutachter?error=Kein+SV-Profil')

  // SV-Profile für Avatar + Name
  const { data: profile } = await supabase
    .from('profiles')
    .select('vorname, nachname, avatar_url, anzeigename')
    .eq('id', user.id)
    .single()
  const displayName =
    (profile?.anzeigename as string) ||
    [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') ||
    'Gutachter'

  // Aktive Session holen — ohne Session gibt es keinen Fokus-Modus
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const session = await getTagesSession(sv.id, today)
  if (!session || session.status === 'finished') {
    redirect('/gutachter/heute?info=Keine+aktive+Tages-Session')
  }

  const terminIds = session.reihenfolge_termin_ids ?? []
  if (terminIds.length === 0) {
    redirect('/gutachter/heute?info=Keine+Stops+in+Session')
  }

  // Termine in Reihenfolge laden
  const { data: termine } = await supabase
    .from('gutachter_termine')
    .select(
      'id, fall_id, start_zeit, status, losgefahren_am, sv_angekommen_am, abschluss_zeit',
    )
    .in('id', terminIds)

  const terminById = new Map<string, Record<string, unknown>>()
  for (const t of termine ?? []) terminById.set(t.id as string, t)

  // Fälle laden
  const fallIds = [...terminById.values()]
    .map((t) => t.fall_id)
    .filter(Boolean) as string[]
  const fallMap = new Map<string, Record<string, unknown>>()
  if (fallIds.length) {
    const { data: faelle } = await supabase
      .from('faelle')
      .select(
        'id, fall_nummer, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, szenario, lead_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng, schadens_adresse, schadens_plz, schadens_ort, sv_briefing_text, sv_briefing_struktur',
      )
      .in('id', fallIds)
    for (const f of (faelle ?? []) as unknown as Record<string, unknown>[]) {
      fallMap.set(f.id as string, f)
    }
  }

  // Leads laden
  const leadIds = [...fallMap.values()]
    .map((f) => f.lead_id)
    .filter(Boolean) as string[]
  const leadMap = new Map<
    string,
    { vorname: string | null; nachname: string | null; telefon: string | null }
  >()
  if (leadIds.length) {
    const { data: leads } = await supabase
      .from('leads')
      .select('id, vorname, nachname, telefon')
      .in('id', leadIds)
    for (const l of leads ?? []) leadMap.set(l.id, l)
  }

  // Stops in session-Reihenfolge
  const stops: FeldmodusStop[] = terminIds
    .map((id, idx) => {
      const t = terminById.get(id)
      if (!t) return null
      const fall = fallMap.get(t.fall_id as string)
      const lead = fall?.lead_id
        ? leadMap.get(fall.lead_id as string)
        : null
      const adresse =
        (fall?.besichtigungsort_adresse as string) ||
        [fall?.schadens_adresse, fall?.schadens_plz, fall?.schadens_ort]
          .filter(Boolean)
          .join(', ') ||
        '—'
      const lat =
        fall?.besichtigungsort_lat != null
          ? Number(fall.besichtigungsort_lat)
          : null
      const lng =
        fall?.besichtigungsort_lng != null
          ? Number(fall.besichtigungsort_lng)
          : null
      const stop: FeldmodusStop = {
        termin_id: t.id as string,
        fall_id: t.fall_id as string,
        index: idx,
        start_zeit: t.start_zeit as string,
        status: t.status as string,
        losgefahren_am: (t.losgefahren_am as string | null) ?? null,
        sv_angekommen_am: (t.sv_angekommen_am as string | null) ?? null,
        abschluss_zeit: (t.abschluss_zeit as string | null) ?? null,
        kunde_name: lead
          ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
          : '—',
        kunde_vorname: lead?.vorname ?? null,
        kunde_telefon: lead?.telefon ?? null,
        fall_nummer:
          (fall?.fall_nummer as string) ??
          ((t.fall_id as string) ?? '').slice(0, 8),
        kennzeichen: (fall?.kennzeichen as string) ?? null,
        fahrzeug:
          [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell]
            .filter(Boolean)
            .join(' ') || null,
        schadentyp: (fall?.szenario as string) ?? null,
        adresse,
        place_id: (fall?.besichtigungsort_place_id as string) ?? null,
        lat,
        lng,
        briefing_text: (fall?.sv_briefing_text as string | null) ?? null,
        briefing_struktur: normalizeStruktur(fall?.sv_briefing_struktur),
      }
      return stop
    })
    .filter(Boolean) as FeldmodusStop[]

  const feldmodusSv: FeldmodusSV = {
    id: sv.id,
    anzeigename: displayName,
    avatar_url: (profile?.avatar_url as string | null) ?? null,
    live_tracking_enabled: sv.live_tracking_enabled !== false,
    standort_lat: sv.standort_lat != null ? Number(sv.standort_lat) : null,
    standort_lng: sv.standort_lng != null ? Number(sv.standort_lng) : null,
  }

  return (
    <FeldmodusClient
      session={session}
      sv={feldmodusSv}
      stops={stops}
      userId={user.id}
    />
  )
}
