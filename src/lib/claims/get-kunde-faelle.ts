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
  fall_nummer: string | null
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
  created_at: string | null
  lead_id: string | null
}

type FallRow = {
  id: string
  claim_id: string | null
  fall_nummer: string | null
  status: string | null
  sa_unterschrieben: boolean | null
  sv_id: string | null
  gutachten_eingegangen_am: string | null
  regulierung_am: string | null
  anschlussschreiben_am: string | null
  szenario: string | null
  onboarding_complete: boolean | null
  kunde_id: string | null
  vollmacht_status: string | null
  vollmacht_signiert_am: string | null
  abgeschlossen_am: string | null
  besichtigungsort_adresse: string | null
  nachbesichtigung_status: string | null
  created_at: string | null
  lead_id: string | null
  // CMM-28α: Übergangs-Snapshot — claim_vehicle_involvements wird erst in
  // Phase 2 systematisch gepflegt. Bis dahin liefert convertLeadToClaim
  // diese Felder direkt auf faelle.
  kennzeichen: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  // CMM-28α: Schadens-Adresse-Drift zwischen faelle und claims — convertLead-
  // ToClaim mappt lead.unfallort momentan in claim.schadenort_adresse, aber
  // in faelle.schadens_ort (Freitext, ohne Splitting). Bis Phase 0.5/Cleanup
  // die Mapping-Convention vereinheitlicht hat, liest der Loader die
  // faelle-Werte wenn vorhanden, sonst Claim-Werte.
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
}

const FALL_SELECT =
  'id, claim_id, fall_nummer, status, sa_unterschrieben, sv_id, gutachten_eingegangen_am, regulierung_am, anschlussschreiben_am, szenario, onboarding_complete, kunde_id, vollmacht_status, vollmacht_signiert_am, abgeschlossen_am, besichtigungsort_adresse, nachbesichtigung_status, created_at, lead_id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, schadens_adresse, schadens_plz, schadens_ort'

const CLAIM_SELECT =
  'id, claim_nummer, schadentag, schadenort_adresse, schadenort_plz, schadenort_ort, polizei_vor_ort, kundenbetreuer_id, created_at, lead_id'

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
    admin
      .from('gutachter_termine')
      .select('fall_id, start_zeit, status, final_verbindlich_ab')
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
      fall_nummer: fall.fall_nummer ?? claim.claim_nummer,
      status: fall.status,
      // CMM-28α: Fahrzeug — vehicles-Row first (durch ZB1-OCR/Cardentity),
      // dann faelle-Snapshot als Fallback. claim_vehicle_involvements ist
      // noch nicht durchgehend gepflegt; Phase 2 wird das systematisch
      // migrieren, dann fällt der faelle-Fallback weg.
      kennzeichen: vehicle?.kennzeichen_aktuell ?? fall.kennzeichen ?? null,
      fahrzeug_hersteller: vehicle?.hersteller ?? fall.fahrzeug_hersteller ?? null,
      fahrzeug_modell: vehicle?.modell_haupttyp ?? fall.fahrzeug_modell ?? null,
      schadens_datum: claim.schadentag,
      sa_unterschrieben: fall.sa_unterschrieben,
      sv_id: fall.sv_id,
      gutachten_eingegangen_am: fall.gutachten_eingegangen_am,
      regulierung_am: fall.regulierung_am,
      anschlussschreiben_am: fall.anschlussschreiben_am,
      szenario: fall.szenario,
      onboarding_complete: fall.onboarding_complete,
      kunde_id: fall.kunde_id,
      kundenbetreuer_id: claim.kundenbetreuer_id,
      polizei_vor_ort: claim.polizei_vor_ort,
      vollmacht_status: fall.vollmacht_status,
      vollmacht_signiert_am: fall.vollmacht_signiert_am,
      abgeschlossen_am: fall.abgeschlossen_am,
      besichtigungsort_adresse: fall.besichtigungsort_adresse,
      // CMM-28α: faelle-first Mapping (siehe FallRow-Kommentar oben).
      schadens_adresse: fall.schadens_adresse ?? claim.schadenort_adresse,
      schadens_plz: fall.schadens_plz ?? claim.schadenort_plz,
      schadens_ort: fall.schadens_ort ?? claim.schadenort_ort,
      nachbesichtigung_status: fall.nachbesichtigung_status,
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
  const { data: fallRow } = await admin
    .from('faelle')
    .select(
      'id, claim_id, fall_nummer, status, szenario, aktuelle_phase, kunde_id, lead_id, sv_id, kundenbetreuer_id, kanzlei_id, schadens_beschreibung, schadens_datum, schadens_hoehe_netto, schadens_adresse, schadens_plz, schadens_ort, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, unfallort, besichtigungsort_adresse, gutachten_eingegangen_am, onboarding_complete, sa_unterschrieben, vollmacht_signiert_am, vollmacht_status, anschlussschreiben_am, regulierung_am, vs_ablehnungsgrund, vs_kuerzung_grund, storno_grund, abgeschlossen_am, google_review_gesendet, gegner_versicherung, kanzlei_ansprechpartner_name, service_typ, polizei_vor_ort, bankdaten_hinterlegt_am, zahlungsweg, zahlung_eingegangen_am, nachbesichtigung_status, nachbesichtigung_termin_datum, nachbesichtigung_angefordert_am',
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
  if (claimId) {
    const [{ data: claimData }, { data: viewData }] = await Promise.all([
      admin
        .from('claims')
        .select(
          'id, claim_nummer, schadentag, schadenort_adresse, schadenort_plz, schadenort_ort, polizei_vor_ort, hergang_kunde_text, schadenart, fall_typ, kanzlei_wunsch, kanzlei_wunsch_gefragt_am, gegner_aktenzeichen, gegner_versicherungsnummer, hat_personenschaden, hat_mietwagen, hat_nutzungsausfall, hat_sachschaden, sachschaden_beschreibung, kunden_konstellation, unfallskizze_url, unfallskizze_svg, unfallskizze_bestaetigt, abgeschlossen_am',
        )
        .eq('id', claimId)
        .maybeSingle(),
      admin
        .from('v_gutachten_werte')
        .select('totalschaden')
        .eq('claim_id', claimId)
        .maybeSingle(),
    ])
    claimRow = claimData ?? null
    gutachtenWerte = viewData ?? null
  }

  // 4. Aktiver Termin (gleiche Logik wie v_faelle_mit_aktuellem_termin)
  const { data: terminRow } = await admin
    .from('gutachter_termine')
    .select(
      'id, status, start_zeit, end_zeit, sv_id, kanal, typ, final_verbindlich_ab',
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
    fall_nummer: f.fall_nummer ?? c.claim_nummer ?? null,
    status: f.status,
    szenario: f.szenario,
    aktuelle_phase: f.aktuelle_phase,
    // FK-Bridge
    kunde_id: f.kunde_id,
    lead_id: f.lead_id,
    sv_id: f.sv_id,
    kundenbetreuer_id: f.kundenbetreuer_id,
    kanzlei_id: f.kanzlei_id,
    // Schadens-Daten — claim ist primary, faelle als Snapshot-Fallback
    schadens_beschreibung: f.schadens_beschreibung ?? c.hergang_kunde_text ?? null,
    schadens_datum: c.schadentag ?? f.schadens_datum ?? null,
    schadens_hoehe_netto: f.schadens_hoehe_netto,
    schadens_adresse: f.schadens_adresse ?? c.schadenort_adresse ?? null,
    schadens_plz: f.schadens_plz ?? c.schadenort_plz ?? null,
    schadens_ort: f.schadens_ort ?? c.schadenort_ort ?? null,
    // Fahrzeug-Snapshot (faelle, bis CVI in Phase 2 systematisch gepflegt)
    kennzeichen: f.kennzeichen,
    fahrzeug_hersteller: f.fahrzeug_hersteller,
    fahrzeug_modell: f.fahrzeug_modell,
    fahrzeug_baujahr: f.fahrzeug_baujahr,
    // Adressen
    unfallort: f.unfallort,
    besichtigungsort_adresse: f.besichtigungsort_adresse,
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
    gutachten_eingegangen_am: f.gutachten_eingegangen_am,
    onboarding_complete: f.onboarding_complete,
    sa_unterschrieben: f.sa_unterschrieben,
    vollmacht_signiert_am: f.vollmacht_signiert_am,
    vollmacht_status: f.vollmacht_status,
    anschlussschreiben_am: f.anschlussschreiben_am,
    regulierung_am: f.regulierung_am,
    vs_ablehnungsgrund: f.vs_ablehnungsgrund,
    vs_kuerzung_grund: f.vs_kuerzung_grund,
    storno_grund: f.storno_grund,
    abgeschlossen_am: f.abgeschlossen_am ?? c.abgeschlossen_am ?? null,
    google_review_gesendet: f.google_review_gesendet,
    // Gegner + Kanzlei
    gegner_versicherung: f.gegner_versicherung,
    kanzlei_ansprechpartner_name: f.kanzlei_ansprechpartner_name,
    // Service / Polizei / Banking / Nachbesichtigung
    service_typ: f.service_typ,
    polizei_vor_ort: c.polizei_vor_ort ?? f.polizei_vor_ort ?? null,
    bankdaten_hinterlegt_am: f.bankdaten_hinterlegt_am,
    zahlungsweg: f.zahlungsweg,
    totalschaden: gutachtenWerte?.totalschaden ?? null,
    zahlung_eingegangen_am: f.zahlung_eingegangen_am,
    nachbesichtigung_status: f.nachbesichtigung_status,
    nachbesichtigung_termin_datum: f.nachbesichtigung_termin_datum,
    nachbesichtigung_angefordert_am: f.nachbesichtigung_angefordert_am,
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
