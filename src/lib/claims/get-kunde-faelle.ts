// CMM-28α (Phase 1a Foundation): Kunde-Portal Loader für die Fall-Liste.
//
// Liest aus `claims` als Anker, joined Lifecycle-Marker aus `faelle`,
// Fahrzeug aus `claim_vehicle_involvements` + `vehicles`, und (für die
// Liste) aktuelle Termine aus `gutachter_termine`.
//
// Warum nicht direkt v_claim_full? → v_claim_full ist Single-Row-Detail-View,
// für eine Liste viel zu fett (Sub-Entity-Aggregates pro Row).
// Warum nicht direkt v_claim_listing? → liefert nur ~15 Felder, FallKarte +
// `ladeFallKartenMeta` brauchen aber `sa_unterschrieben`, `vollmacht_status`,
// `nachbesichtigung_status`, `gutachter_termin_*` etc. — die liegen während
// der Übergangsphase noch in `faelle` bzw. `gutachter_termine`.
//
// Ownership-Resolution:
//   1. claim_parties.user_id = userId UND rolle = 'geschaedigter'
//   2. Fallback: faelle.kunde_id = userId (alte Pfade die noch nicht
//      claim_parties pflegen)
//   3. Fallback: leads.email = email AND lead → claim (für brandneue Kunden
//      bei denen die Auto-Claim-Logik in /kunde/page.tsx noch nicht durch ist)
//
// Output: `KundeFallView[]` mit exakt den Feldern, die FallKarte +
// `ladeFallKartenMeta` heute aus dem alten View-Read konsumieren — damit
// CMM-28β (Page-Switch) ein reines Drop-In-Replacement wird.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

type DbClient = SupabaseClient<Database>

export type KundeFallView = {
  /** faelle.id — bleibt während Übergangsphase die ID die /kunde/faelle/[id]-Route konsumiert. */
  id: string
  /** claims.id — schon mit referenziert für CMM-28β/γ (URL-Switch optional). */
  claim_id: string | null
  claim_nummer: string | null
  status: string | null
  /** Fahrzeugdaten — aus claim_vehicle_involvements (Rolle 'geschaedigter') ∪ vehicles. */
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  /** schadens_datum = claims.schadentag (claim ist SSoT für Schadenereignis). */
  schadens_datum: string | null
  /** Lifecycle-Marker aus faelle — werden in Phase 6 nach claims migriert. */
  sa_unterschrieben: boolean | null
  sv_id: string | null
  gutachten_eingegangen_am: string | null
  regulierung_am: string | null
  anschlussschreiben_am: string | null
  szenario: string | null
  onboarding_complete: boolean | null
  kunde_id: string | null
  kundenbetreuer_id: string | null
  polizei_vor_ort: boolean | null
  vollmacht_status: string | null
  vollmacht_signiert_am: string | null
  abgeschlossen_am: string | null
  besichtigungsort_adresse: string | null
  /** schadens_adresse/plz/ort = claims.schadenort_*. */
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
  nachbesichtigung_status: string | null
  created_at: string | null
  /** Termin-Snippet aus gutachter_termine — analog zur alten View. */
  sv_termin: string | null
  gutachter_termin_status: string | null
  gutachter_termin_bestaetigt_am: string | null
}

type ClaimRow = {
  id: string
  claim_nummer: string | null
  schadentag: string | null
  schadenort_adresse: string | null
  schadenort_plz: string | null
  schadenort_ort: string | null
  polizei_vor_ort: boolean | null
  kundenbetreuer_id: string | null
  // CMM-44 SP-A: abgeschlossen_am ist claims-Duplikat-Spalte (claims = SSoT).
  abgeschlossen_am: string | null
  created_at: string | null
  lead_id: string | null
  // CMM-44 SP-B PR2a: szenario + onboarding_complete leben auf claims (SSoT).
  szenario: string | null
  onboarding_complete: boolean | null
  // CMM-44 SP-B PR2b: sa_unterschrieben, vollmacht_status, vollmacht_signiert_am
  // leben auf claims (SSoT).
  sa_unterschrieben: boolean | null
  vollmacht_status: string | null
  vollmacht_signiert_am: string | null
}

type FallRow = {
  id: string
  claim_id: string | null
  status: string | null
  sv_id: string | null
  regulierung_am: string | null
  anschlussschreiben_am: string | null
  kunde_id: string | null
  // CMM-44 SP-D PR2a: besichtigungsort_adresse + nachbesichtigung_status
  // entfernt — kommen aus gutachter_termine (SSoT) via terminByFall.
  created_at: string | null
  lead_id: string | null
  // CMM-28α: Übergangs-Snapshot — claim_vehicle_involvements wird erst in
  // Phase 2 systematisch gepflegt. Bis dahin liefert convertLeadToClaim
  // diese Felder direkt auf faelle.
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  // CMM-44 SP-A2 (Cluster 1): Schadensort lebt auf claims (schadenort_*, SSoT).
  // Die Property-Namen schadens_* bleiben als API-Vertrag fuer die Consumer.
  schadens_adresse: string | null
  schadens_plz: string | null
  schadens_ort: string | null
}

type VehicleInvolvementRow = {
  claim_id: string
  vehicle_id: string | null
}

type VehicleRow = {
  id: string
  kennzeichen_aktuell: string | null
  hersteller: string | null
  modell_haupttyp: string | null
}

type TerminRow = {
  fall_id: string
  start_zeit: string | null
  status: string | null
  final_verbindlich_ab: string | null
  // CMM-44 SP-D PR2a: besichtigungsort_adresse + nachbesichtigung_status aus gutachter_termine (SSoT).
  besichtigungsort_adresse: string | null
  nachbesichtigung_status: string | null
}

// CMM-44 SP-A: abgeschlossen_am aus FALL_SELECT entfernt — claims-Duplikat-
// Spalte (claims = SSoT), wird via CLAIM_SELECT geladen.
// CMM-44 SP-A2 (Cluster 1): schadens_adresse/_plz/_ort entfernt — Semantik-
// Duplikate, claims (schadenort_*) ist SSoT, via CLAIM_SELECT geladen.
// CMM-44 SP-B PR2a: szenario + onboarding_complete aus FALL_SELECT entfernt —
// leben jetzt auf claims (SSoT), werden via CLAIM_SELECT geladen.
// CMM-44 SP-B PR2b: sa_unterschrieben, vollmacht_status, vollmacht_signiert_am
// aus FALL_SELECT entfernt — leben auf claims (SSoT), via CLAIM_SELECT geladen.
// CMM-44 SP-G PR2: gutachten_eingegangen_am aus FALL_SELECT entfernt —
// fertiggestellt_am lebt auf gutachten (SSoT), via CLAIM_SELECT-Embed geladen.
// CMM-44 SP-D PR2a: besichtigungsort_adresse + nachbesichtigung_status aus
// FALL_SELECT entfernt — leben auf gutachter_termine (SSoT), werden via
// terminRes geladen.
const FALL_SELECT =
  'id, claim_id, status, sv_id, regulierung_am, anschlussschreiben_am, kunde_id, created_at, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell'

const CLAIM_SELECT =
  'id, claim_nummer, schadentag, schadenort_adresse, schadenort_plz, schadenort_ort, polizei_vor_ort, kundenbetreuer_id, abgeschlossen_am, created_at, lead_id, szenario, onboarding_complete, sa_unterschrieben, vollmacht_status, vollmacht_signiert_am'

/**
 * Lädt alle Fälle, die einem Kunden gehören, in der Shape, die FallKarte +
 * ladeFallKartenMeta heute konsumieren. Nutzt Admin-Client, weil die
 * Lead-Email-Fallback-Logik claim_parties + leads-Tabellen quer-querien
 * muss und die User-RLS während der Migration nicht alle Pfade durchlässt.
 *
 * Stabil + idempotent: Aufrufe mit denselben Parametern liefern dieselbe
 * Liste, keine Side-Effects (kein claim/setzen, kein Auto-Claim — das macht
 * /kunde/page.tsx selber via claimFaelleByEmail).
 */
export async function getKundeFaelle(
  admin: DbClient,
  userId: string,
  email: string | null,
): Promise<KundeFallView[]> {
  // ─── 1. Claim-IDs sammeln aus drei Quellen ──────────────────────────────
  const claimIds = new Set<string>()

  // 1a) claim_parties: User ist als Geschädigter eingetragen
  const { data: parties } = await admin
    .from('claim_parties')
    .select('claim_id')
    .eq('user_id', userId)
    .eq('rolle', 'geschaedigter')
  for (const p of (parties ?? []) as Array<{ claim_id: string | null }>) {
    if (p.claim_id) claimIds.add(p.claim_id)
  }

  // 1b) faelle.kunde_id-Fallback — alte Pfade ohne claim_parties.user_id
  const { data: faelleByKunde } = await admin
    .from('faelle')
    .select('claim_id')
    .eq('kunde_id', userId)
    .not('claim_id', 'is', null)
  for (const f of (faelleByKunde ?? []) as Array<{ claim_id: string | null }>) {
    if (f.claim_id) claimIds.add(f.claim_id)
  }

  // 1c) Lead-Email-Fallback — Kunde wurde frisch angelegt, kunde_id ist
  // noch nirgends gesetzt. Nur wenn Email vorhanden ist.
  if (email) {
    const { data: leadIds } = await admin
      .from('leads')
      .select('id')
      .eq('email', email)
    const leadIdList = (leadIds ?? []).map((l) => l.id as string)
    if (leadIdList.length > 0) {
      const { data: claimsByLead } = await admin
        .from('claims')
        .select('id')
        .in('lead_id', leadIdList)
      for (const c of (claimsByLead ?? []) as Array<{ id: string }>) {
        claimIds.add(c.id)
      }
    }
  }

  if (claimIds.size === 0) return []

  const claimIdArr = Array.from(claimIds)

  // ─── 2. Claims + Faelle parallel laden ─────────────────────────────────
  const [claimsRes, faelleRes, terminRes, cviRes] = await Promise.all([
    admin.from('claims').select(CLAIM_SELECT).in('id', claimIdArr),
    admin.from('faelle').select(FALL_SELECT).in('claim_id', claimIdArr),
    // CMM-44 SP-D PR2a: besichtigungsort_adresse + nachbesichtigung_status
    // aus gutachter_termine (SSoT) geladen.
    admin
      .from('gutachter_termine')
      .select('fall_id, start_zeit, status, final_verbindlich_ab, besichtigungsort_adresse, nachbesichtigung_status')
      .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
      .order('start_zeit', { ascending: true }),
    admin
      .from('claim_vehicle_involvements')
      .select('claim_id, vehicle_id')
      .in('claim_id', claimIdArr)
      .eq('rolle', 'geschaedigter'),
  ])

  const claims = (claimsRes.data ?? []) as ClaimRow[]
  const faelle = (faelleRes.data ?? []) as FallRow[]
  const termine = (terminRes.data ?? []) as TerminRow[]
  const cviRows = (cviRes.data ?? []) as VehicleInvolvementRow[]

  // Vehicle-Daten für die referenzierten vehicle_ids nachladen.
  const vehicleIds = Array.from(
    new Set(cviRows.map((c) => c.vehicle_id).filter(Boolean) as string[]),
  )
  const vehiclesById = new Map<string, VehicleRow>()
  if (vehicleIds.length > 0) {
    const { data: vehicles } = await admin
      .from('vehicles')
      .select('id, kennzeichen_aktuell, hersteller, modell_haupttyp')
      .in('id', vehicleIds)
    for (const v of (vehicles ?? []) as VehicleRow[]) {
      vehiclesById.set(v.id, v)
    }
  }

  // ─── 3. Maps für O(1) Joins ────────────────────────────────────────────
  const fallByClaim = new Map<string, FallRow>()
  for (const f of faelle) {
    if (f.claim_id) fallByClaim.set(f.claim_id, f)
  }

  const cviByClaim = new Map<string, VehicleInvolvementRow>()
  for (const c of cviRows) {
    // Wenn mehrere Geschädigte: nimm den ersten (Pre-Multi-Vehicle-Phase
    // hat üblicherweise genau einen Geschädigten pro Claim).
    if (!cviByClaim.has(c.claim_id)) cviByClaim.set(c.claim_id, c)
  }

  // Pro fall_id den jüngsten Termin der noch lebt — gleiche Logik wie
  // v_faelle_mit_aktuellem_termin (status-Priority, dann start_zeit DESC).
  const PRIO: Record<string, number> = {
    bestaetigt: 1,
    gegenvorschlag: 2,
    reserviert: 3,
  }
  const terminByFall = new Map<string, TerminRow>()
  for (const t of termine) {
    const existing = terminByFall.get(t.fall_id)
    if (!existing) {
      terminByFall.set(t.fall_id, t)
      continue
    }
    const a = PRIO[t.status ?? ''] ?? 99
    const b = PRIO[existing.status ?? ''] ?? 99
    if (a < b) terminByFall.set(t.fall_id, t)
  }

  // ─── 4. Mapping zu KundeFallView ───────────────────────────────────────
  const result: KundeFallView[] = []
  for (const claim of claims) {
    const fall = fallByClaim.get(claim.id) ?? null
    if (!fall) continue // Kein faelle-Row → noch kein konvertierter Lead, nicht im Kunde-Portal sichtbar

    const cvi = cviByClaim.get(claim.id) ?? null
    const vehicle = cvi?.vehicle_id ? vehiclesById.get(cvi.vehicle_id) : null
    const termin = terminByFall.get(fall.id) ?? null

    result.push({
      id: fall.id,
      claim_id: claim.id,
      claim_nummer: claim.claim_nummer,
      status: fall.status,
      // CMM-28α: Fahrzeug — vehicles-Row first (durch ZB1-OCR/Cardentity),
      // dann faelle-Snapshot als Fallback. claim_vehicle_involvements ist
      // noch nicht durchgehend gepflegt; Phase 2 wird das systematisch
      // migrieren, dann fällt der faelle-Fallback weg.
      kennzeichen: vehicle?.kennzeichen_aktuell ?? fall.kennzeichen ?? null,
      fahrzeug_hersteller: vehicle?.hersteller ?? fall.fahrzeug_hersteller ?? null,
      fahrzeug_modell: vehicle?.modell_haupttyp ?? fall.fahrzeug_modell ?? null,
      schadens_datum: claim.schadentag,
      // CMM-44 SP-B PR2b: sa_unterschrieben aus claims (SSoT).
      sa_unterschrieben: claim.sa_unterschrieben,
      sv_id: fall.sv_id,
      // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT).
      // FALL_SELECT lädt kein gutachten-Embed (Listenview — zu fett).
      // Wert bleibt null in der Liste; Detail-Loader befüllt ihn.
      gutachten_eingegangen_am: null,
      regulierung_am: fall.regulierung_am,
      anschlussschreiben_am: fall.anschlussschreiben_am,
      // CMM-44 SP-B PR2a: szenario + onboarding_complete aus claims (SSoT).
      szenario: claim.szenario,
      onboarding_complete: claim.onboarding_complete,
      kunde_id: fall.kunde_id,
      kundenbetreuer_id: claim.kundenbetreuer_id,
      polizei_vor_ort: claim.polizei_vor_ort,
      // CMM-44 SP-B PR2b: vollmacht_status + vollmacht_signiert_am aus claims (SSoT).
      vollmacht_status: claim.vollmacht_status,
      vollmacht_signiert_am: claim.vollmacht_signiert_am,
      abgeschlossen_am: claim.abgeschlossen_am,
      // CMM-44 SP-D PR2a: besichtigungsort_adresse + nachbesichtigung_status
      // aus aktuellem gutachter_termine (SSoT via terminByFall).
      besichtigungsort_adresse: termin?.besichtigungsort_adresse ?? null,
      // CMM-44 SP-A2 (Cluster 1): claims (schadenort_*) ist SSoT — faelle-Teil
      // des Coalesce entfernt. Property-Namen schadens_* bleiben als API-Vertrag
      // fuer die ~10 Consumer (FallKarte, ClaimSummary, …).
      schadens_adresse: claim.schadenort_adresse,
      schadens_plz: claim.schadenort_plz,
      schadens_ort: claim.schadenort_ort,
      nachbesichtigung_status: termin?.nachbesichtigung_status ?? null,
      created_at: claim.created_at ?? fall.created_at,
      sv_termin: termin?.start_zeit ?? null,
      gutachter_termin_status: termin?.status ?? null,
      gutachter_termin_bestaetigt_am: termin?.final_verbindlich_ab ?? null,
    })
  }

  // Sortierung: jüngste zuerst (gleiche Convention wie /kunde/page.tsx).
  result.sort((a, b) => {
    const ta = a.created_at ? new Date(a.created_at).getTime() : 0
    const tb = b.created_at ? new Date(b.created_at).getTime() : 0
    return tb - ta
  })

  return result
}

/**
 * Konvenienz-Wrapper: lädt einen einzelnen Kunde-Fall per faelle.id.
 * /kunde/faelle/[id]/page.tsx kann das in CMM-28β nutzen.
 */
export async function getKundeFallById(
  admin: DbClient,
  userId: string,
  email: string | null,
  fallId: string,
): Promise<KundeFallView | null> {
  const list = await getKundeFaelle(admin, userId, email)
  return list.find((f) => f.id === fallId) ?? null
}

// ─── Detail-Loader: 1:1-Drop-In für getFallById(FALL_SELECT_KUNDE) ─────────
// Liest aus claims als Anker, joined faelle (Lifecycle-Bridge),
// gutachter_termine (jüngster aktiver Termin) und vehicles (über CVI).
// Output ist ein flaches Record-Objekt mit denselben Spalten-Namen wie
// das alte FALL_SELECT_KUNDE — damit die Detail-Page + ihre Sub-Components
// 1:1 weiter funktionieren ohne Type-Refactor. Echter Win kommt mit
// Phase 6 (faelle abspecken) + CMM-32 (auftraege-Sub-Entity).
export async function getKundeFallDetailRecord(
  admin: DbClient,
  userId: string,
  email: string | null,
  fallId: string,
): Promise<Record<string, unknown> | null> {
  // 1. faelle laden — Detail braucht die volle Lifecycle-Spaltenliste.
  // Cluster F+G PR-2b: `totalschaden` wandert von faelle nach v_gutachten_werte (Single-Source gutachten).
  // CMM-44 SP-A: kundenbetreuer_id, kanzlei_ansprechpartner_name, abgeschlossen_am,
  // polizei_vor_ort sind claims-Duplikat-Spalten (claims = SSoT) — aus dem
  // faelle-Read entfernt, sie kommen unten aus dem claims-Read.
  // CMM-44 SP-A2 (Cluster 1): schadens_datum, schadens_adresse/_plz/_ort,
  // unfallort entfernt — Semantik-Duplikate, claims (schadentag / schadenort_*)
  // ist SSoT, sie kommen unten aus dem claims-Read.
  // CMM-44 SP-A2 (Cluster 2): schadens_beschreibung entfernt — Semantik-Duplikat,
  // claims.hergang_kunde_text ist SSoT, kommt unten aus dem claims-Read.
  // CMM-44 SP-A2 (Cluster 3): aktuelle_phase + vs_ablehnungsgrund entfernt —
  // Semantik-Duplikate, claims (phase / vs_ablehnungs_grund) ist SSoT, sie
  // kommen unten aus dem claims-Read.
  // CMM-44 SP-B PR2a: szenario, onboarding_complete, google_review_gesendet,
  // service_typ aus dem faelle-Read entfernt — leben auf claims (SSoT).
  // CMM-44 SP-B PR2b: sa_unterschrieben, vollmacht_signiert_am, vollmacht_status
  // aus dem faelle-Read entfernt — leben auf claims (SSoT), kommen unten aus dem claims-Read.
  // CMM-44 SP-B PR2c: schadens_hoehe_netto aus dem faelle-Read entfernt — lebt
  // auf claims (SSoT), kommt unten aus dem claims-Read.
  // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT) — aus faelle-Select entfernt.
  // CMM-44 SP-D PR2a: besichtigungsort_adresse, nachbesichtigung_status,
  // nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am aus dem
  // faelle-Select entfernt — leben auf gutachter_termine (SSoT), kommen unten
  // aus dem terminRow-Read.
  // CMM-44 SP-H PR2: storno_grund aus dem faelle-Select entfernt — lebt auf
  // auftraege (aktueller Auftrag), wird unten parallel zum claims-Read geladen.
  const { data: fallRow } = await admin
    .from('faelle')
    .select(
      'id, claim_id, status, kunde_id, lead_id, sv_id, kanzlei_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, anschlussschreiben_am, regulierung_am, vs_kuerzung_grund, gegner_versicherung, bankdaten_hinterlegt_am, zahlungsweg, zahlung_eingegangen_am',
    )
    .eq('id', fallId)
    .maybeSingle()

  if (!fallRow) return null

  // 2. Ownership: claim_parties.user_id ODER faelle.kunde_id ODER lead.email
  const owner = (fallRow as { kunde_id: string | null }).kunde_id
  let isOwner = owner === userId
  if (!isOwner) {
    const claimId = (fallRow as { claim_id: string | null }).claim_id
    if (claimId) {
      const { data: party } = await admin
        .from('claim_parties')
        .select('id')
        .eq('claim_id', claimId)
        .eq('user_id', userId)
        .eq('rolle', 'geschaedigter')
        .limit(1)
        .maybeSingle()
      if (party) isOwner = true
    }
  }
  if (!isOwner && email) {
    const leadId = (fallRow as { lead_id: string | null }).lead_id
    if (leadId) {
      const { data: lead } = await admin
        .from('leads')
        .select('email')
        .eq('id', leadId)
        .maybeSingle()
      if ((lead?.email as string | null) === email) isOwner = true
    }
  }
  if (!isOwner) return null

  // 3. Claim-Anker + v_gutachten_werte parallel laden.
  // Cluster F+G PR-2b: `totalschaden` kommt nicht mehr aus faelle, sondern aus
  // v_gutachten_werte (Single-Source gutachten).
  const claimId = (fallRow as { claim_id: string | null }).claim_id
  let claimRow: Record<string, unknown> | null = null
  let gutachtenWerte: { totalschaden: boolean | null } | null = null
  let gutachtenFertiggestelltAm: string | null = null
  // CMM-44 SP-H PR2: storno_grund kommt aus dem aktuellen Auftrag (reihenfolge DESC).
  let stornoGrund: string | null = null
  if (claimId) {
    const [{ data: claimData }, { data: viewData }, { data: gutachtenRow }, { data: aktAuftragRow }] = await Promise.all([
      admin
        .from('claims')
        .select(
          // CMM-44 SP-A: kundenbetreuer_id + kanzlei_ansprechpartner_name
          // ergaenzt — claims = SSoT der Duplikat-Spalten.
          // CMM-44 SP-A2 Cluster 3: phase + vs_ablehnungs_grund ergaenzt.
          // CMM-44 SP-B PR2a: szenario, onboarding_complete, google_review_gesendet,
          // service_typ ergaenzt — lives auf claims (SSoT).
          // CMM-44 SP-B PR2b: sa_unterschrieben, vollmacht_signiert_am,
          // vollmacht_status ergaenzt — leben auf claims (SSoT).
          // CMM-44 SP-B PR2c: schadens_hoehe_netto ergaenzt — lebt auf claims (SSoT).
          'id, claim_nummer, schadentag, schadenort_adresse, schadenort_plz, schadenort_ort, polizei_vor_ort, hergang_kunde_text, schadenart, fall_typ, kanzlei_wunsch, kanzlei_wunsch_gefragt_am, gegner_aktenzeichen, gegner_versicherungsnummer, hat_personenschaden, hat_mietwagen, hat_nutzungsausfall, hat_sachschaden, sachschaden_beschreibung, kunden_konstellation, unfallskizze_url, unfallskizze_svg, unfallskizze_bestaetigt, abgeschlossen_am, kundenbetreuer_id, kanzlei_ansprechpartner_name, phase, vs_ablehnungs_grund, szenario, onboarding_complete, google_review_gesendet, service_typ, sa_unterschrieben, vollmacht_signiert_am, vollmacht_status, schadens_hoehe_netto',
        )
        .eq('id', claimId)
        .maybeSingle(),
      admin
        .from('v_gutachten_werte')
        .select('totalschaden')
        .eq('claim_id', claimId)
        .maybeSingle(),
      // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT).
      admin
        .from('gutachten')
        .select('fertiggestellt_am')
        .eq('claim_id', claimId)
        .maybeSingle(),
      // CMM-44 SP-H PR2: storno_grund aus dem aktuellen Auftrag (reihenfolge DESC).
      admin
        .from('auftraege')
        .select('storno_grund')
        .eq('claim_id', claimId)
        .order('reihenfolge', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    claimRow = claimData ?? null
    gutachtenWerte = viewData ?? null
    gutachtenFertiggestelltAm = (gutachtenRow as { fertiggestellt_am?: string | null } | null)?.fertiggestellt_am ?? null
    stornoGrund = (aktAuftragRow as { storno_grund?: string | null } | null)?.storno_grund ?? null
  }

  // 4. Aktiver Termin (gleiche Logik wie v_faelle_mit_aktuellem_termin)
  // CMM-44 SP-D PR2a: besichtigungsort_adresse, nachbesichtigung_status,
  // nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am aus
  // gutachter_termine (SSoT) geladen.
  const { data: terminRow } = await admin
    .from('gutachter_termine')
    .select(
      'id, status, start_zeit, end_zeit, sv_id, kanal, typ, final_verbindlich_ab, besichtigungsort_adresse, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am',
    )
    .eq('fall_id', fallId)
    .in('status', ['reserviert', 'gegenvorschlag', 'bestaetigt'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // 5. Output bauen — flaches Record, kompatibel zu FALL_SELECT_KUNDE
  const f = fallRow as Record<string, unknown>
  const c = (claimRow ?? {}) as Record<string, unknown>
  const t = (terminRow ?? {}) as Record<string, unknown>

  return {
    // Identität / Status / Phase
    id: f.id,
    claim_id: claimId,
    claim_nummer: c.claim_nummer ?? null,
    status: f.status,
    // CMM-44 SP-B PR2a: szenario aus claims (SSoT).
    szenario: c.szenario ?? null,
    // CMM-44 SP-A2 (Cluster 3): claims.phase ist SSoT. Property-Name
    // aktuelle_phase bleibt als API-Vertrag (FALL_SELECT_KUNDE-Shape).
    aktuelle_phase: c.phase ?? null,
    // FK-Bridge
    kunde_id: f.kunde_id,
    lead_id: f.lead_id,
    sv_id: f.sv_id,
    // CMM-44 SP-A: kundenbetreuer_id aus claims (SSoT).
    kundenbetreuer_id: c.kundenbetreuer_id ?? null,
    kanzlei_id: f.kanzlei_id,
    // CMM-44 SP-A2 (Cluster 2): claims.hergang_kunde_text ist SSoT.
    // Property-Name schadens_beschreibung bleibt als API-Vertrag.
    schadens_beschreibung: c.hergang_kunde_text ?? null,
    // CMM-44 SP-A2 (Cluster 1): claims (schadentag / schadenort_*) ist SSoT.
    // Property-Namen schadens_*/unfallort bleiben als API-Vertrag.
    schadens_datum: c.schadentag ?? null,
    // CMM-44 SP-B PR2c: schadens_hoehe_netto aus claims (SSoT).
    schadens_hoehe_netto: (c.schadens_hoehe_netto as number | null) ?? null,
    schadens_adresse: c.schadenort_adresse ?? null,
    schadens_plz: c.schadenort_plz ?? null,
    schadens_ort: c.schadenort_ort ?? null,
    // Fahrzeug-Snapshot (faelle, bis CVI in Phase 2 systematisch gepflegt)
    kennzeichen: f.kennzeichen,
    fahrzeug_hersteller: f.fahrzeug_hersteller,
    fahrzeug_modell: f.fahrzeug_modell,
    fahrzeug_baujahr: f.fahrzeug_baujahr,
    // Adressen — unfallort ist Cluster-1-Duplikat von claims.schadenort_adresse.
    unfallort: c.schadenort_adresse ?? null,
    // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (SSoT).
    besichtigungsort_adresse: t.besichtigungsort_adresse ?? null,
    // Termin (aus gutachter_termine, gleiche View-Aliase)
    sv_termin: t.start_zeit ?? null,
    gutachter_termin_status: t.status ?? null,
    gutachter_termin_bestaetigt_am: t.final_verbindlich_ab ?? null,
    aktueller_termin_id: t.id ?? null,
    aktueller_termin_start: t.start_zeit ?? null,
    aktueller_termin_end: t.end_zeit ?? null,
    aktueller_termin_status: t.status ?? null,
    aktueller_termin_sv_id: t.sv_id ?? null,
    aktueller_termin_kanal: t.kanal ?? null,
    aktueller_termin_typ: t.typ ?? null,
    aktueller_termin_final_verbindlich_ab: t.final_verbindlich_ab ?? null,
    // Lifecycle-Marker (faelle bis Phase 6)
    // CMM-44 SP-G PR2: gutachten_eingegangen_am → gutachten.fertiggestellt_am (SSoT).
    gutachten_eingegangen_am: gutachtenFertiggestelltAm,
    // CMM-44 SP-B PR2a: onboarding_complete aus claims (SSoT).
    onboarding_complete: c.onboarding_complete ?? null,
    // CMM-44 SP-B PR2b: sa_unterschrieben, vollmacht_signiert_am, vollmacht_status
    // aus claims (SSoT).
    sa_unterschrieben: c.sa_unterschrieben ?? null,
    vollmacht_signiert_am: c.vollmacht_signiert_am ?? null,
    vollmacht_status: c.vollmacht_status ?? null,
    anschlussschreiben_am: f.anschlussschreiben_am,
    regulierung_am: f.regulierung_am,
    // CMM-44 SP-A2 (Cluster 3): claims.vs_ablehnungs_grund ist SSoT.
    // Property-Name vs_ablehnungsgrund bleibt als API-Vertrag.
    vs_ablehnungsgrund: c.vs_ablehnungs_grund ?? null,
    vs_kuerzung_grund: f.vs_kuerzung_grund,
    // CMM-44 SP-H PR2: storno_grund aus dem aktuellen Auftrag (auftraege-SSoT).
    storno_grund: stornoGrund,
    // CMM-44 SP-A: abgeschlossen_am aus claims (SSoT).
    abgeschlossen_am: c.abgeschlossen_am ?? null,
    // CMM-44 SP-B PR2a: google_review_gesendet aus claims (SSoT).
    google_review_gesendet: c.google_review_gesendet ?? null,
    // Gegner + Kanzlei
    gegner_versicherung: f.gegner_versicherung,
    // CMM-44 SP-A: kanzlei_ansprechpartner_name aus claims (SSoT).
    kanzlei_ansprechpartner_name: c.kanzlei_ansprechpartner_name ?? null,
    // Service / Polizei / Banking / Nachbesichtigung
    // CMM-44 SP-B PR2a: service_typ aus claims (SSoT).
    service_typ: c.service_typ ?? null,
    // CMM-44 SP-A: polizei_vor_ort aus claims (SSoT).
    polizei_vor_ort: c.polizei_vor_ort ?? null,
    bankdaten_hinterlegt_am: f.bankdaten_hinterlegt_am,
    zahlungsweg: f.zahlungsweg,
    totalschaden: gutachtenWerte?.totalschaden ?? null,
    zahlung_eingegangen_am: f.zahlung_eingegangen_am,
    // CMM-44 SP-D PR2a: nachbesichtigung_* aus gutachter_termine (SSoT).
    nachbesichtigung_status: t.nachbesichtigung_status ?? null,
    nachbesichtigung_termin_datum: t.nachbesichtigung_termin_datum ?? null,
    nachbesichtigung_angefordert_am: t.nachbesichtigung_angefordert_am ?? null,
    // Claim-spezifische Felder die der Kunde zusätzlich nutzen kann
    hergang_kunde_text: c.hergang_kunde_text ?? null,
    schadenart: c.schadenart ?? null,
    fall_typ: c.fall_typ ?? null,
    kanzlei_wunsch: c.kanzlei_wunsch ?? null,
    hat_personenschaden: c.hat_personenschaden ?? null,
    hat_mietwagen: c.hat_mietwagen ?? null,
    hat_nutzungsausfall: c.hat_nutzungsausfall ?? null,
    hat_sachschaden: c.hat_sachschaden ?? null,
    sachschaden_beschreibung: c.sachschaden_beschreibung ?? null,
    kunden_konstellation: c.kunden_konstellation ?? null,
    unfallskizze_url: c.unfallskizze_url ?? null,
    unfallskizze_svg: c.unfallskizze_svg ?? null,
    unfallskizze_bestaetigt: c.unfallskizze_bestaetigt ?? null,
    gegner_aktenzeichen: c.gegner_aktenzeichen ?? null,
    gegner_versicherungsnummer: c.gegner_versicherungsnummer ?? null,
  }
}
