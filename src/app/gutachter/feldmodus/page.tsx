// AAR-382: Fokus-Modus — server-seitiger Data-Load.
// Lädt die aktive Tages-Session, Termine in Reihenfolge, Fall+Lead+Briefing,
// SV-Profil mit Avatar. Ohne Session → Redirect zum Heute-Tab.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
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
  claim_nummer: string
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
  // Auftrag-Kontext für die Vor-Ort-Vorbereitung
  auftrag_typ: string | null
  einzusammelnde_dokumente: Array<{ slot_id: string; label: string }>
  hat_vorschaeden: boolean | null
  vorschaden_anzahl: number | null
  vorschaden_letzter_datum: string | null
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

  // CMM-32f: Termine + Fälle + Leads via Admin-Client laden — RLS auf
  // faelle/leads matchen ggf. nur faelle.sv_id (legacy), nach Migration
  // läuft die Zuordnung aber über auftraege.sv_id. Die Auth ist bereits
  // über die Tages-Session (sv_id) erfolgt — hier reichen wir die SV-
  // gefilterte Termin-Liste durch und laden die zugehörigen Daten
  // RLS-frei nach.
  const admin = createAdminClient()

  // Termine in Reihenfolge laden — sv_id-Filter als Defense-in-Depth
  const { data: termine } = await admin
    .from('gutachter_termine')
    .select(
      'id, fall_id, start_zeit, status, losgefahren_am, sv_angekommen_am, abschluss_zeit',
    )
    .in('id', terminIds)
    .eq('sv_id', sv.id)

  const terminById = new Map<string, Record<string, unknown>>()
  for (const t of termine ?? []) terminById.set(t.id as string, t)

  // Fälle laden
  const fallIds = [...terminById.values()]
    .map((t) => t.fall_id)
    .filter(Boolean) as string[]
  const fallMap = new Map<string, Record<string, unknown>>()
  if (fallIds.length) {
    // CMM-44 SP-A2 (Cluster 1): schadenort_* aus claims (SSoT) via claim_id-Embed.
    // CMM-44 SP-B PR2a: szenario liegt ebenfalls auf claims (SSoT) — in den
    // claims-Embed aufgenommen.
    // CMM-44 SP-D PR2a: besichtigungsort_* aus gutachter_termine (aktueller Termin, SSoT).
    const { data: faelle } = await admin
      .from('faelle')
      .select(
        'id, claim_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, sv_briefing_text, sv_briefing_struktur, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, claims:claim_id(schadenort_adresse, schadenort_plz, schadenort_ort, claim_nummer, szenario)',
      )
      .in('id', fallIds)
    for (const f of (faelle ?? []) as unknown as Record<string, unknown>[]) {
      fallMap.set(f.id as string, f)
    }

    // Batch-Fetch besichtigungsort aus gutachter_termine (aktueller Termin pro claim).
    const feldClaimIds = Array.from(
      new Set((faelle ?? []).map((f) => (f as Record<string, unknown>).claim_id as string | null).filter(Boolean) as string[]),
    )
    if (feldClaimIds.length) {
      const { data: gtLocs } = await admin
        .from('gutachter_termine')
        .select('claim_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng')
        .in('claim_id', feldClaimIds)
        .order('start_zeit', { ascending: false })
      // Merge: pro claim_id den ersten (neuesten) Treffer in den fallMap-Eintrag einmergen.
      const gtFeldMap = new Map<string, { besichtigungsort_adresse: string | null; besichtigungsort_place_id: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>()
      for (const gt of (gtLocs ?? []) as Array<{ claim_id: string | null; besichtigungsort_adresse: string | null; besichtigungsort_place_id: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>) {
        if (gt.claim_id && !gtFeldMap.has(gt.claim_id)) gtFeldMap.set(gt.claim_id, gt)
      }
      for (const [fallId2, f] of fallMap.entries()) {
        const claimId2 = (f as Record<string, unknown>).claim_id as string | null
        if (claimId2) {
          const gtEntry = gtFeldMap.get(claimId2)
          if (gtEntry) {
            ;(f as Record<string, unknown>).besichtigungsort_adresse = gtEntry.besichtigungsort_adresse
            ;(f as Record<string, unknown>).besichtigungsort_place_id = gtEntry.besichtigungsort_place_id
            ;(f as Record<string, unknown>).besichtigungsort_lat = gtEntry.besichtigungsort_lat
            ;(f as Record<string, unknown>).besichtigungsort_lng = gtEntry.besichtigungsort_lng
          }
        }
      }
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
    const { data: leads } = await admin
      .from('leads')
      .select('id, vorname, nachname, telefon')
      .in('id', leadIds)
    for (const l of leads ?? []) leadMap.set(l.id, l)
  }

  // Aufträge pro Fall (CMM-32f) — für Auftrag-Typ + Pflichtdokumente
  const auftragMap = new Map<string, { typ: string; status: string }>()
  if (fallIds.length) {
    const { data: auftraege } = await admin
      .from('auftraege')
      .select('fall_id, typ, status, reihenfolge')
      .in('fall_id', fallIds)
      .eq('sv_id', sv.id)
      .order('reihenfolge', { ascending: false })
    // Höchster Reihenfolge-Wert = aktiver Auftrag
    for (const a of (auftraege ?? []) as Array<{ fall_id: string; typ: string; status: string }>) {
      if (!auftragMap.has(a.fall_id)) auftragMap.set(a.fall_id, { typ: a.typ, status: a.status })
    }
  }

  // Pflichtdokumente pro Fall — Slots die der SV vor Ort einsammeln soll.
  // Filter: pflicht=true UND status nicht 'erfuellt'/'geprueft' UND
  // (uploadbar_von enthält 'kunde' oder 'sachverstaendiger' — ignorieren wir
  // hier weil der SV alles einsammelt was offen ist).
  const pflichtMap = new Map<string, Array<{ slot_id: string; label: string }>>()
  if (fallIds.length) {
    const [{ data: pflichtRows }, { data: katalogRows }] = await Promise.all([
      admin
        .from('pflichtdokumente')
        .select('fall_id, dokument_typ, status, pflicht')
        .in('fall_id', fallIds)
        .eq('pflicht', true),
      admin
        .from('dokument_katalog')
        .select('slot_id, label'),
    ])
    const labelMap = new Map<string, string>()
    for (const k of (katalogRows ?? []) as Array<{ slot_id: string; label: string }>) {
      labelMap.set(k.slot_id, k.label)
    }
    for (const p of (pflichtRows ?? []) as Array<{
      fall_id: string
      dokument_typ: string
      status: string
      pflicht: boolean
    }>) {
      // Nur „offen" — schon erfüllte/geprüfte werden ausgeblendet
      if (p.status === 'erfuellt' || p.status === 'geprueft') continue
      if (!pflichtMap.has(p.fall_id)) pflichtMap.set(p.fall_id, [])
      pflichtMap.get(p.fall_id)!.push({
        slot_id: p.dokument_typ,
        label: labelMap.get(p.dokument_typ) ?? p.dokument_typ,
      })
    }
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
      // CMM-44 SP-A2 (Cluster 1): schadenort_* aus dem claims-Embed.
      // CMM-44 SP-B PR2a: szenario ebenfalls aus dem claims-Embed.
      const fallClaim = (Array.isArray(fall?.claims) ? fall.claims[0] : fall?.claims) as
        | { schadenort_adresse: string | null; schadenort_plz: string | null; schadenort_ort: string | null; claim_nummer: string | null; szenario: string | null }
        | null
        | undefined
      const adresse =
        (fall?.besichtigungsort_adresse as string) ||
        [fallClaim?.schadenort_adresse, fallClaim?.schadenort_plz, fallClaim?.schadenort_ort]
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
      const fallId = t.fall_id as string
      const auftrag = auftragMap.get(fallId) ?? null
      const stop: FeldmodusStop = {
        termin_id: t.id as string,
        fall_id: fallId,
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
        claim_nummer:
          (fallClaim?.claim_nummer as string) ??
          ((t.fall_id as string) ?? '').slice(0, 8),
        kennzeichen: (fall?.kennzeichen as string) ?? null,
        fahrzeug:
          [fall?.fahrzeug_hersteller, fall?.fahrzeug_modell]
            .filter(Boolean)
            .join(' ') || null,
        // CMM-44 SP-B PR2a: szenario aus dem claims-Embed (SSoT).
        schadentyp: (fallClaim?.szenario as string) ?? null,
        adresse,
        place_id: (fall?.besichtigungsort_place_id as string) ?? null,
        lat,
        lng,
        briefing_text: (fall?.sv_briefing_text as string | null) ?? null,
        briefing_struktur: normalizeStruktur(fall?.sv_briefing_struktur),
        auftrag_typ: auftrag?.typ ?? null,
        einzusammelnde_dokumente: pflichtMap.get(fallId) ?? [],
        hat_vorschaeden: (fall?.hat_vorschaeden as boolean | null) ?? null,
        vorschaden_anzahl: (fall?.vorschaden_anzahl as number | null) ?? null,
        vorschaden_letzter_datum: (fall?.vorschaden_letzter_datum as string | null) ?? null,
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
