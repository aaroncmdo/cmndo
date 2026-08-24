// AAR-382: Fokus-Modus — server-seitiger Data-Load.
// Lädt die aktive Tages-Session, Termine in Reihenfolge, Fall+Lead+Briefing,
// SV-Profil mit Avatar. Ohne Session → Redirect zum Heute-Tab.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { getTagesSession } from '@/lib/sv/tages-session'
import { effektiveBezugIds, effektiveFallClaimId, type TerminBezugRow } from '@/lib/termine/effektive-bezug-ids'
import { bezugInExpr } from '@/lib/termine/bezug-filter'
import { weavePrivatStops } from '@/lib/feldmodus/weave-privat-stops'
import FeldmodusClient from './FeldmodusClient'
import type { SvBriefingStruktur } from '@/lib/types/field-modus'
import EmptyState from '@/components/shared/EmptyState'
import { CheckCircle2 } from 'lucide-react'

export const dynamic = 'force-dynamic'

export type FeldmodusStop = {
  termin_id: string
  // 2026-07-08 (Aaron): 'termin' = echter Gutachter-Termin (voller Besichtigungs-Flow),
  // 'privat' = Kalender-Wegpunkt ohne Besichtigung (Pin + Route-Eintrag + TBT-Ziel, kein „angekommen").
  kind: 'termin' | 'privat'
  fall_id: string
  claim_id: string | null
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

  // Aktive Session holen — ohne Session gibt es keinen Fokus-Modus.
  // getTagesSession leitet den Berliner Kalendertag intern ab (berlinIsoDate),
  // daher den rohen Instant durchreichen statt server-lokale Mitternacht.
  const session = await getTagesSession(sv.id, new Date())
  // Ohne Session gibt es keinen Fokus-Modus -> zurueck zur Tagesuebersicht.
  if (!session) {
    redirect('/gutachter/heute?info=Keine+aktive+Tages-Session')
  }
  // 2026-07-17 (Feldmodus-Operativ-Audit): Tag abgeschlossen -> CONTENT statt
  // redirect(). Grund: nach dem letzten Stop setzt completeAndAdvance die Session
  // auf 'finished'; Next re-rendert die Action-Ursprungs-Route automatisch nach
  // JEDER Server-Action -> ein redirect() in diesem Re-Render wirft (POST=500 im
  // Reconnect-Drain, belegt im Prod-Nachsmoke). Ein Content-Return rendert sauber
  // -> kein 500. Zugleich UX-Plus: klare Abschluss-Bestaetigung statt stillem
  // Bounce nach /heute. Gilt fuer online-Abschluss + Offline-Reconnect (selber
  // Render-Pfad). Guard-Redirect oben bleibt = kein Redirect-Stub (Content-return).
  if (session.status === 'finished') {
    return (
      <div className="h-full flex flex-col">
        <EmptyState
          icon={CheckCircle2}
          title="Tagesmodus abgeschlossen"
          description="Alle Besichtigungen für heute sind erledigt. Gut gemacht!"
          action={{ label: 'Zur Tagesübersicht', href: '/gutachter/heute' }}
        />
      </div>
    )
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
      // AAR-956/CMM-49: lead_id + bezug_typ/bezug_id für bezug-native Termine
      // (Engine schreibt fall_id/lead_id NULL) — sonst leerer Stop ohne Kunde.
      'id, fall_id, lead_id, bezug_typ, bezug_id, start_zeit, status, losgefahren_am, sv_angekommen_am, abschluss_zeit',
    )
    .in('id', terminIds)
    // CMM-49 sv_id-Drop (Termin-Engine-Handoff): gutachter_termine.sv_id -> assignee
    .eq('assignee_id', sv.id)
    .eq('assignee_typ', 'sachverstaendiger')

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
    // CMM-44 SP-H PR2: sv_briefing_text/sv_briefing_struktur aus dem faelle-Select
    // entfernt — leben auf auftraege (aktueller Auftrag). Werden unten aus der
    // bestehenden auftraege-Batch-Abfrage (reihenfolge DESC) in fallMap gemergt.
    // CMM-49: faelle->v_claim_full (claim-anchored SSoT). Fahrzeug via vehicles,
    // schadenort_*/claim_nummer/szenario flach aus der View und zurueck in die
    // claims-Embed-Form gemappt, damit die fallMap-Consumer (fall.claims, claim_id)
    // unveraendert bleiben. id:fall_id + claim_id:id-Aliase erhalten Keys/Shapes.
    const { data: faelleFlat } = await admin
      .from('v_claim_full')
      .select(
        'id:fall_id, claim_id:id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, schadenort_adresse, schadenort_plz, schadenort_ort, claim_nummer, szenario',
      )
      .in('fall_id', fallIds)
    const faelle = (faelleFlat ?? []).map((row) => {
      const x = row as Record<string, unknown>
      return {
        id: x.id,
        claim_id: x.claim_id,
        kennzeichen: x.kennzeichen,
        fahrzeug_hersteller: x.fahrzeug_hersteller,
        fahrzeug_modell: x.fahrzeug_modell,
        lead_id: x.lead_id,
        hat_vorschaeden: x.hat_vorschaeden,
        vorschaden_anzahl: x.vorschaden_anzahl,
        vorschaden_letzter_datum: x.vorschaden_letzter_datum,
        claims: {
          schadenort_adresse: x.schadenort_adresse,
          schadenort_plz: x.schadenort_plz,
          schadenort_ort: x.schadenort_ort,
          claim_nummer: x.claim_nummer,
          szenario: x.szenario,
        },
      }
    })
    for (const f of faelle as unknown as Record<string, unknown>[]) {
      fallMap.set(f.id as string, f)
    }

    // Batch-Fetch besichtigungsort aus gutachter_termine (aktueller Termin pro claim).
    const feldClaimIds = Array.from(
      new Set((faelle ?? []).map((f) => (f as Record<string, unknown>).claim_id as string | null).filter(Boolean) as string[]),
    )
    if (feldClaimIds.length) {
      const { data: gtLocs } = await admin
        .from('gutachter_termine')
        // bezug_typ/bezug_id mitladen — sonst laesst sich der Claim der bezug-nativen
        // Treffer (claim_id NULL) unten nicht bestimmen.
        .select('claim_id, bezug_typ, bezug_id, besichtigungsort_adresse, besichtigungsort_place_id, besichtigungsort_lat, besichtigungsort_lng')
        .or(bezugInExpr('claim', feldClaimIds))
        .order('start_zeit', { ascending: false })
      // Merge: pro Claim den ersten (neuesten) Treffer in den fallMap-Eintrag einmergen.
      const gtFeldMap = new Map<string, { besichtigungsort_adresse: string | null; besichtigungsort_place_id: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>()
      for (const gt of (gtLocs ?? []) as Array<{ claim_id: string | null; bezug_typ: string | null; bezug_id: string | null; besichtigungsort_adresse: string | null; besichtigungsort_place_id: string | null; besichtigungsort_lat: number | null; besichtigungsort_lng: number | null }>) {
        // NICHT gt.claim_id — bezug-native Zeilen haetten dort NULL.
        const cId = effektiveFallClaimId(gt)
        if (cId && !gtFeldMap.has(cId)) gtFeldMap.set(cId, gt)
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
  // AAR-956/CMM-49: Leads aus den Fällen UND direkt aus bezug-nativen Terminen
  // (ohne fall_id) laden — sonst zeigt der Stop keinen Kunden.
  const leadIdsFromFaelle = [...fallMap.values()]
    .map((f) => f.lead_id)
    .filter(Boolean) as string[]
  const leadIdsFromTermine = [...terminById.values()]
    .filter((t) => !t.fall_id)
    .map((t) => effektiveBezugIds(t as TerminBezugRow).leadId)
    .filter((id): id is string => !!id)
  const leadIds = Array.from(new Set([...leadIdsFromFaelle, ...leadIdsFromTermine]))
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

  // Aufträge pro Fall (CMM-32f) — für Auftrag-Typ + Pflichtdokumente.
  // CMM-44 SP-H PR2: sv_briefing_text/sv_briefing_struktur kommen aus dem aktuellen
  // Auftrag (höchster reihenfolge-Wert) — in den fallMap-Eintrag mergen, damit die
  // Stop-Erstellung unten weiterhin fall.sv_briefing_* lesen kann.
  const auftragMap = new Map<string, { typ: string; status: string }>()
  if (fallIds.length) {
    const { data: auftraege } = await admin
      .from('auftraege')
      .select('fall_id, typ, status, reihenfolge, sv_briefing_text, sv_briefing_struktur')
      .in('fall_id', fallIds)
      .eq('sv_id', sv.id)
      .order('reihenfolge', { ascending: false })
    // Höchster Reihenfolge-Wert = aktiver Auftrag
    for (const a of (auftraege ?? []) as Array<{ fall_id: string; typ: string; status: string; sv_briefing_text: string | null; sv_briefing_struktur: unknown }>) {
      if (!auftragMap.has(a.fall_id)) {
        auftragMap.set(a.fall_id, { typ: a.typ, status: a.status })
        const f = fallMap.get(a.fall_id)
        if (f) {
          f.sv_briefing_text = a.sv_briefing_text
          f.sv_briefing_struktur = a.sv_briefing_struktur
        }
      }
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

  // Termin-Stops in session-Reihenfolge (Privat-Stops werden unten zeitlich eingewoben).
  const termineStops: FeldmodusStop[] = terminIds
    .map((id, idx) => {
      const t = terminById.get(id)
      if (!t) return null
      const fall = fallMap.get(t.fall_id as string)
      // AAR-956/CMM-49: Lead aus dem Fall ODER (bezug-nativ, ohne Fall) direkt aus
      // dem Termin via effektiveBezugIds — sonst bleibt der Stop-Kunde leer.
      const effLeadId = effektiveBezugIds(t as TerminBezugRow).leadId
      const lead = fall?.lead_id
        ? leadMap.get(fall.lead_id as string)
        : effLeadId
          ? leadMap.get(effLeadId)
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
        kind: 'termin' as const,
        fall_id: fallId,
        // claim-nativ fuer den Chat-Cutover (kunde_gruppe-Thread); null bei bezug-nativen Stops ohne Fall.
        claim_id: (fall?.claim_id as string | null) ?? null,
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

  // 2026-07-08 (Aaron): Privat-Stops (sv_private_stops) als Wegpunkte in die Route einweben.
  // Reiner Wegpunkt OHNE Besichtigung (kind:'privat', synthetische termin_id) — TBT + Pins laufen
  // ueber das stops-Array, also wird der Wegpunkt automatisch navigiert. Admin-Client, scoped auf
  // die eigene sv.id + den Session-Kalendertag (session.datum). Nur Stops mit Koordinaten.
  const { data: privatRows } = await admin
    .from('sv_private_stops')
    .select('id, titel, start_zeit, end_zeit, address, place_id, lat, lng')
    .eq('sv_id', sv.id)
    .eq('datum', session.datum)
    .order('start_zeit', { ascending: true })
  const privatStops: FeldmodusStop[] = ((privatRows ?? []) as Array<Record<string, unknown>>)
    .filter((r) => r.lat != null && r.lng != null)
    .map((r) => ({
      termin_id: `privat:${r.id as string}`,
      kind: 'privat' as const,
      fall_id: '',
      claim_id: null,
      index: 0, // unten neu vergeben
      start_zeit: r.start_zeit as string,
      status: 'privat',
      losgefahren_am: null,
      sv_angekommen_am: null,
      abschluss_zeit: null,
      kunde_name: ((r.titel as string | null) ?? '').trim() || 'Privater Termin',
      kunde_vorname: null,
      kunde_telefon: null,
      claim_nummer: '',
      kennzeichen: null,
      fahrzeug: null,
      schadentyp: null,
      adresse: ((r.address as string | null) ?? '').trim() || '—',
      place_id: (r.place_id as string | null) ?? null,
      lat: r.lat != null ? Number(r.lat) : null,
      lng: r.lng != null ? Number(r.lng) : null,
      briefing_text: null,
      briefing_struktur: null,
      auftrag_typ: null,
      einzusammelnde_dokumente: [],
      hat_vorschaeden: null,
      vorschaden_anzahl: null,
      vorschaden_letzter_datum: null,
    }))

  // Termine bleiben in Session-Reihenfolge; Privat-Stops zeitlich dazwischen einsortiert + re-indexed.
  // Pure + getestet: src/lib/feldmodus/weave-privat-stops.ts (weave-privat-stops.test.ts).
  const stops: FeldmodusStop[] = weavePrivatStops(termineStops, privatStops)

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
