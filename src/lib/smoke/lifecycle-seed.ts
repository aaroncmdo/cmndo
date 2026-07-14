// Smoke-Seeder für die Claim-Lifecycle-Phasen.
//
// Erstellt mehrere Claims mit jeweils einem Fall + ggf. Auftrag + Termin
// + Kanzleifall, sodass jede Hauptphase (erfassung / begutachtung /
// regulierung / abschluss) und die wichtigsten Subphasen am gleichen
// Test-Kunden + Test-KB + Test-SV durchgespielt werden können.
//
// Reset entfernt alle vorher per Seed angelegten Claims; Cascade löscht
// faelle, auftraege, gutachter_termine, kanzlei_faelle, leads.

import { createAdminClient } from '@/lib/supabase/admin'

// Fixe IDs aus der Production-DB (CMM-37 Audit, 2026-05-02)
// B4-Harness/Go-Live-Cleanup (13.07., kunde=0): die alten Test-Konten wurden gepurged.
// geschaedigter_user_id + kundenbetreuer_id FK -> profiles; Parity braucht nur FK-Gueltigkeit
// (geschaedigter beeinflusst die Phasen-Ableitung nicht). Aktuelle valide Prod-IDs:
const KUNDE_ID = '22b65fa0-4bcf-4c4c-8ab9-f119670c7db0' // valides Staff-Profil (kunde=0 nach Cleanup)
const KB_ID = 'aa000001-0000-0000-0000-000000000001' // Anna Weber (kundenbetreuer, ueberlebte den Cleanup)
const SV_ID = '523b21c5-06a4-47c0-b0c5-9b61d5e2804c' // valider Sachverstaendiger (alter 677400bf gecleant)

// SMOKE_TAG_PREFIX wird in claims.fall_typ gespeichert — pro Szenario mit
// Index-Suffix (SMOKE-LC-01 … SMOKE-LC-10). Doppelfunktion:
//   • Reset/Loader filtern per Prefix (`fall_typ LIKE 'SMOKE-LC%'`).
//   • page.tsx ordnet Szenario↔Claim per exaktem `SMOKE-LC-<idx>`-Match zu.
// CMM-44 SP-A3: ersetzt den frueheren faelle-Aktennummer-Praefix-Marker
// (`SMOKE-LC-<idx>-<ts>`), der mit dem SP-A3-Drop der faelle-Aktennummer
// entfallen ist.
const SMOKE_TAG_PREFIX = 'SMOKE-LC'

/** claims.fall_typ-Marker fuer ein Szenario, z.B. 'SMOKE-LC-04'. */
export function smokeTagForScenario(scenarioIndex: number): string {
  return `${SMOKE_TAG_PREFIX}-${String(scenarioIndex + 1).padStart(2, '0')}`
}

export type Scenario = {
  key: string
  label: string
  expected: string
}

export const SCENARIOS: Scenario[] = [
  { key: 'erfassung-sa-offen', label: 'Erfassung · SA offen', expected: 'Lead, kein SA — Stepper "sa_offen"' },
  { key: 'erfassung-vollmacht-offen', label: 'Erfassung · Vollmacht offen', expected: 'SA unterschrieben, keine Vollmacht — "vollmacht_offen"' },
  { key: 'erfassung-onboarding-offen', label: 'Erfassung · Onboarding offen', expected: 'Vollmacht unterschrieben, fall.onboarding_complete=false — "onboarding_offen"' },
  { key: 'begutachtung-termin', label: 'Begutachtung · Termin reserviert', expected: 'Auftrag termin, gutachter_termin reserviert' },
  { key: 'begutachtung-besichtigung', label: 'Begutachtung · Besichtigung läuft', expected: 'Auftrag besichtigung, sv_unterwegs_seit gesetzt' },
  { key: 'begutachtung-gutachten-qc', label: 'Begutachtung · Gutachten in QC', expected: 'Auftrag gutachten, gutachten_url, !final — KB sieht QC-Card' },
  { key: 'begutachtung-reject', label: 'Begutachtung · Zurückgewiesen', expected: 'zurueckgewiesen_am gesetzt, SV soll nachbessern' },
  { key: 'regulierung-vs-kontakt', label: 'Regulierung · VS-Kontakt', expected: 'kanzlei_faelle versicherungskontakt — Stepper "regulierung"' },
  { key: 'regulierung-auszahlung', label: 'Regulierung · Auszahlung läuft', expected: 'kanzlei_faelle auszahlung, ausgezahlt_am' },
  { key: 'abschluss', label: 'Abschluss · alles fertig', expected: 'Alle auftraege abgeschlossen, kanzlei_faelle ausgezahlt' },
  // B4-slice-2a-i: Klage-Terminal ueber die state-machine-Konvergenz (operative_status=
  // 'klage_rechtsstreit', wie uebergebeFallKlage es nach dem Fix schreibt). Beweist: View-m_sub
  // (status) UND getClaimLifecycle-milestone leiten BEIDE abschluss/klage_rechtsstreit ab
  // (Anzeige-Neutralitaet der Konvergenz).
  { key: 'abschluss-klage', label: 'Abschluss · Klage/Rechtsstreit', expected: 'Klage-Terminal — Stepper "abschluss/klage_rechtsstreit" aus operative_status UND status' },
]

export type SeededRow = {
  scenarioKey: string
  claimId: string
  fallId: string
  fallNummer: string | null
}

export async function seedAllScenarios(): Promise<{ ok: boolean; rows: SeededRow[]; error?: string }> {
  const db = createAdminClient()
  const rows: SeededRow[] = []
  try {
    // Erst löschen, falls schon was da ist
    await deleteAllSmoke(db)

    for (const sc of SCENARIOS) {
      const seeded = await seedOne(db, sc.key)
      rows.push(seeded)
    }
    return { ok: true, rows }
  } catch (err) {
    return { ok: false, rows, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function resetAllScenarios(): Promise<{ ok: boolean; geloescht: number; error?: string }> {
  const db = createAdminClient()
  try {
    const n = await deleteAllSmoke(db)
    return { ok: true, geloescht: n }
  } catch (err) {
    return { ok: false, geloescht: 0, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── interna ────────────────────────────────────────────────────────────────

type Db = ReturnType<typeof createAdminClient>

async function deleteAllSmoke(db: Db): Promise<number> {
  // FK-geordnet loeschen: die Child-Rows (auftraege/gutachter_termine/kanzlei_faelle/
  // faelle_claim_bridge) blocken sonst den claims-Delete (kein DELETE-CASCADE). gutachter_termine
  // haelt zudem einen lead_id-FK (Trigger-Backfill) -> blockt den leads-Delete. Beides hier aufloesen.
  const { data: smokeClaims } = await db
    .from('claims').select('id, lead_id').like('fall_typ', `${SMOKE_TAG_PREFIX}%`)
  const claimIds = (smokeClaims ?? []).map((c) => c.id as string)
  const leadIds = (smokeClaims ?? [])
    .map((c) => c.lead_id as string | null).filter(Boolean) as string[]

  if (claimIds.length > 0) {
    for (const [t, col] of [
      ['gutachter_termine', 'claim_id'], ['kanzlei_faelle', 'claim_id'],
      ['auftraege', 'fall_id'], ['faelle_claim_bridge', 'claim_id'],
    ] as const) {
      await db.from(t).delete().in(col, claimIds)
    }
    await db.from('claims').delete().in('id', claimIds)
  }
  if (leadIds.length > 0) {
    await db.from('gutachter_termine').delete().in('lead_id', leadIds)
    await db.from('leads').delete().in('id', leadIds)
  }
  return claimIds.length
}

async function seedOne(db: Db, scenarioKey: string): Promise<SeededRow> {
  const idx = SCENARIOS.findIndex((s) => s.key === scenarioKey)

  // 1) Lead — abhaengig vom Erfassungsstand
  const sceneIsErfassungVollmachtOffen = scenarioKey === 'erfassung-vollmacht-offen'
  const sceneIsErfassungOnboardingOffen = scenarioKey === 'erfassung-onboarding-offen'
  const sceneNeedsLeadOnly = scenarioKey === 'erfassung-sa-offen'
  const isErfassung = sceneNeedsLeadOnly || sceneIsErfassungVollmachtOffen || sceneIsErfassungOnboardingOffen

  const sa_unterschrieben = !sceneNeedsLeadOnly
  const vollmacht_signiert_am = sceneIsErfassungOnboardingOffen || !isErfassung
    ? new Date(Date.now() - 86400_000).toISOString()
    : null

  const { data: lead, error: leadErr } = await db.from('leads').insert({
    vorname: 'Aaron',
    nachname: 'Sprafke',
    email: 'aaron.sprafke+kunde15@claimondo.de',
    telefon: '+4917620289514',
    sa_unterschrieben,
    vollmacht_signiert_am,
    // SP-B PR2a: onboarding_complete lebt auf claims (SSoT) — NICHT mehr auf leads.
  }).select('id').single()
  if (leadErr || !lead) throw new Error(`lead insert: ${leadErr?.message ?? 'kein lead'}`)
  const leadId = lead.id as string

  // 2) Claim — Phase + Status je nach Szenario
  const phaseStatus = derivePhaseStatus(scenarioKey)
  const { data: claim, error: claimErr } = await db.from('claims').insert({
    schadentag: '2026-04-15',
    schadenort_adresse: 'Teststraße 12',
    schadenort_plz: '10115',
    schadenort_ort: 'Berlin',
    schadenart: 'haftpflicht',
    // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — aus dem
    // faelle-INSERT hierher verschoben.
    schadens_ursache: 'unfall',
    // CMM-44 SP-A3: szenario-spezifischer Marker (SMOKE-LC-<idx>) — dient
    // Reset-Filter UND Szenario↔Claim-Zuordnung in der Smoke-Lifecycle-Page.
    fall_typ: smokeTagForScenario(idx),
    // CMM-44 MP-6c: claims.phase gedroppt — kein phase-Write mehr. Die Phase
    // leitet sich aus status + Sub-Entity-Zustand ab (v_claim_phase).
    work_state: phaseStatus.work_state,
    status: phaseStatus.status,
    operative_status: phaseStatus.operative_status,
    // FG6: SA/Vollmacht sind post-conversion auf dem CLAIM kanonisch (getClaimLifecycle liest
    // die Claim-Copy via readClaimSigningState) -> synchron zum Lead setzen, sonst driftet
    // getClaimLifecycle(claim) vs v_claim_phase(liest l.sa_unterschrieben) auf den Erfassungs-Subs.
    sa_unterschrieben,
    sa_unterschrieben_am: sa_unterschrieben ? new Date(Date.now() - 2 * 86400_000).toISOString() : null,
    vollmacht_signiert_am,
    geschaedigter_user_id: KUNDE_ID,
    kundenbetreuer_id: KB_ID,
    lead_id: leadId,
    // CMM-44 SP-B PR2a: onboarding_complete lebt auf claims (SSoT) — nicht
    // mehr im faelle-INSERT.
    onboarding_complete: !isErfassung,
  }).select('id, claim_nummer').single()
  if (claimErr || !claim) throw new Error(`claim insert: ${claimErr?.message ?? 'kein claim'}`)
  const claimId = claim.id as string
  // CMM-44 SP-A3: claim_nummer ist die kanonische Aktennummer (DB-Trigger).
  const fallNummer = (claim.claim_nummer as string | null) ?? null

  // 3) Fall — wenn nicht reine Erfassung-vor-Abschluss-SA.
  // CMM-49 faelle-DROP: keine faelle-Row mehr — die faelle_claim_bridge entsteht via
  // trg_sync_claims_to_bridge beim claims-INSERT oben (fall_id == claim_id). Also fallId == claimId.
  let fallId = ''
  if (!sceneNeedsLeadOnly) {
    fallId = claimId

    // 4) Auftraege + Termine
    await seedAuftragArtefakte(db, scenarioKey, fallId, claimId)
  }

  return { scenarioKey, claimId, fallId, fallNummer }
}

// D2/T1.1b: work_state (Dispatch/Processing) getrennt von status (Lifecycle/Terminal).
// Aktive Szenarien -> work_state gesetzt, status NULL; Lifecycle-Szenarien -> status gesetzt.
// B4/CMM-74: operative_status ist die SSoT-Phasen-Achse -> MUSS gesetzt sein, sonst
// liefert v_claim_phase (o_sub) NULL und gewinnt den SUB_ORDER-Tie -> falsche Parity-Fails.
// Der operative_status je Szenario ist mit dem Lead-/Auftrag-/Kanzleifall-Zustand konsistent,
// sodass v_claim_phase (SQL) und getClaimLifecycle (TS) bit-gleich dieselbe (main, sub) liefern.
function derivePhaseStatus(key: string): { phase: string; status: string | null; work_state: string | null; operative_status: string } {
  switch (key) {
    case 'erfassung-sa-offen':
    case 'erfassung-vollmacht-offen':
    case 'erfassung-onboarding-offen':
      // Erfassungs-Sub kommt aus den Lead-Feldern (leadSubphase / o_sub-Lead-CASE) -> 'ersterfassung' reicht.
      return { phase: '0_lead', work_state: 'dispatch_done', status: null, operative_status: 'ersterfassung' }
    case 'begutachtung-termin':
      return { phase: '3_gutachter_unterwegs', work_state: 'in_bearbeitung', status: null, operative_status: 'sv-termin' }
    case 'begutachtung-besichtigung':
      return { phase: '3_gutachter_unterwegs', work_state: 'in_bearbeitung', status: null, operative_status: 'besichtigung' }
    case 'begutachtung-gutachten-qc':
    case 'begutachtung-reject':
      return { phase: '4_gutachten_fertig', work_state: 'in_bearbeitung', status: null, operative_status: 'gutachten-eingegangen' }
    case 'regulierung-vs-kontakt':
      // B4-Slice-1: operative_status traegt den Non-Terminal-Outcome direkt (post-write-flip-Zustand)
      // -> testet die neue o_sub-Ergaenzung 'in_kommunikation_vs' -> versicherungskontakt.
      return { phase: '6_kommunikation_versicherung', work_state: 'in_bearbeitung', status: 'in_kommunikation_vs', operative_status: 'in_kommunikation_vs' }
    case 'regulierung-auszahlung':
      return { phase: '9_reguliert', work_state: 'in_bearbeitung', status: null, operative_status: 'zahlung-eingegangen' }
    case 'abschluss':
      // Terminal: post-B2 traegt operative_status den feinen Outcome direkt (statt coarse 'abgeschlossen')
      // -> testet zugleich die #4285-Output-Neutralitaet (fine Terminal in operative_status).
      return { phase: '9_reguliert', work_state: 'in_bearbeitung', status: 'reguliert_vollstaendig', operative_status: 'reguliert_vollstaendig' }
    case 'abschluss-klage':
      // B4-slice-2a-i: Klage-Terminal nach der state-machine-Konvergenz — operative_status traegt
      // 'klage_rechtsstreit' (statt des groben 'klage'), status ebenfalls. Beide Read-Engines
      // muessen abschluss/klage_rechtsstreit liefern.
      return { phase: '9_reguliert', work_state: 'in_bearbeitung', status: 'klage_rechtsstreit', operative_status: 'klage_rechtsstreit' }
    default:
      return { phase: '1_neu', work_state: 'dispatch_done', status: null, operative_status: 'ersterfassung' }
  }
}

async function seedAuftragArtefakte(
  db: Db,
  scenarioKey: string,
  fallId: string,
  claimId: string,
): Promise<void> {
  if (scenarioKey.startsWith('erfassung')) return

  // Auftrag-Status pro Szenario
  const auftragStatus =
    scenarioKey === 'begutachtung-termin' ? 'termin' :
    scenarioKey === 'begutachtung-besichtigung' ? 'besichtigung' :
    scenarioKey === 'begutachtung-gutachten-qc' ? 'gutachten' :
    scenarioKey === 'begutachtung-reject' ? 'gutachten' :
    'abgeschlossen'

  const finalFreigegeben =
    scenarioKey === 'regulierung-vs-kontakt' ||
    scenarioKey === 'regulierung-auszahlung' ||
    scenarioKey.startsWith('abschluss')

  const gutachtenUrl =
    scenarioKey === 'begutachtung-gutachten-qc' ||
    scenarioKey === 'begutachtung-reject' ||
    finalFreigegeben
      ? 'https://example.com/smoke-gutachten.pdf'
      : null

  const zurueckgewiesenAm = scenarioKey === 'begutachtung-reject'
    ? new Date(Date.now() - 3600_000).toISOString() : null
  const zurueckweisungGrund = scenarioKey === 'begutachtung-reject'
    ? 'SMOKE: Bilder unscharf — bitte Front-Stoßstange neu' : null

  const { data: auftrag } = await db.from('auftraege').insert({
    fall_id: fallId,
    sv_id: SV_ID,
    typ: 'erstgutachten',
    status: auftragStatus,
    gutachten_url: gutachtenUrl,
    gutachten_final_freigegeben: finalFreigegeben,
    grundhonorar_netto: finalFreigegeben ? 540 : null,
    grundhonorar_brutto: finalFreigegeben ? 642.6 : null,
    zurueckgewiesen_am: zurueckgewiesenAm,
    zurueckweisung_grund: zurueckweisungGrund,
    abgeschlossen_am: scenarioKey.startsWith('abschluss') ? new Date().toISOString() : null,
  }).select('id').single()
  const auftragId = (auftrag?.id as string | undefined) ?? null

  // Termin für Begutachtungs-Szenarien
  if (scenarioKey === 'begutachtung-termin' || scenarioKey === 'begutachtung-besichtigung') {
    const startInTwoHours = new Date(Date.now() + 2 * 3600_000).toISOString()
    const svUnterwegsSeit = scenarioKey === 'begutachtung-besichtigung'
      ? new Date(Date.now() - 30 * 60_000).toISOString() : null
    // CMM-44 SP-D PR2b: besichtigungsort auf gutachter_termine (Phase-6-valid).
    await db.from('gutachter_termine').insert({
      fall_id: fallId,
      claim_id: claimId,
      auftrag_id: auftragId,
      assignee_id: SV_ID,
      assignee_typ: 'sachverstaendiger',
      status: 'bestaetigt',
      start_zeit: startInTwoHours,
      end_zeit: new Date(new Date(startInTwoHours).getTime() + 60 * 60_000).toISOString(),
      sv_unterwegs_seit: svUnterwegsSeit,
      besichtigungsort_adresse: 'Teststraße 12, 10115 Berlin',
    })
  }

  // Kanzleifall + Auszahlung
  if (
    scenarioKey === 'regulierung-vs-kontakt' ||
    scenarioKey === 'regulierung-auszahlung' ||
    scenarioKey.startsWith('abschluss')
  ) {
    const ausgezahlt = scenarioKey !== 'regulierung-vs-kontakt'
    await db.from('kanzlei_faelle').insert({
      claim_id: claimId, // CMM-37: kanonisch via claim
      status: ausgezahlt ? 'auszahlung' : 'versicherungskontakt',
      vs_kontakt_am: new Date(Date.now() - 7 * 86400_000).toISOString(),
      ausgezahlt_am: ausgezahlt ? new Date(Date.now() - 86400_000).toISOString() : null,
    })
  }
}
