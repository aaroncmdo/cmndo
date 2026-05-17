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
const KUNDE_ID = '879b4b31-eeb4-47a1-add5-531898874a7c' // aaron.sprafke+kunde15@claimondo.de
const KB_ID = 'aa000001-0000-0000-0000-000000000001' // Anna Weber (kb@claimondo.de)
const SV_ID = '677400bf-dd31-4581-a645-07a7d624c190' // Test-Aaron / aaron.sprafke@claimondo.de

const SMOKE_TAG = 'SMOKE-LC' // wird in claim.fall_typ gespeichert für Reset-Filter

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
  // Cascade an claims → faelle → auftraege/kanzlei_faelle/gutachter_termine.
  // Leads müssen wir explizit aufräumen.
  const { data: smokeClaims } = await db
    .from('claims').select('id, lead_id').eq('fall_typ', SMOKE_TAG)
  const claimIds = (smokeClaims ?? []).map((c) => c.id as string)
  const leadIds = (smokeClaims ?? [])
    .map((c) => c.lead_id as string | null).filter(Boolean) as string[]

  if (claimIds.length > 0) {
    await db.from('claims').delete().in('id', claimIds)
  }
  if (leadIds.length > 0) {
    await db.from('leads').delete().in('id', leadIds)
  }
  return claimIds.length
}

async function seedOne(db: Db, scenarioKey: string): Promise<SeededRow> {
  const idx = SCENARIOS.findIndex((s) => s.key === scenarioKey)
  const nr = String(idx + 1).padStart(2, '0')

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
    onboarding_complete: !isErfassung || sceneIsErfassungOnboardingOffen ? false : false,
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
    fall_typ: SMOKE_TAG, // marker für Reset
    phase: phaseStatus.phase,
    status: phaseStatus.status,
    geschaedigter_user_id: KUNDE_ID,
    kundenbetreuer_id: KB_ID,
    lead_id: leadId,
  }).select('id').single()
  if (claimErr || !claim) throw new Error(`claim insert: ${claimErr?.message ?? 'kein claim'}`)
  const claimId = claim.id as string

  // 3) Fall — wenn nicht reine Erfassung-vor-Abschluss-SA
  let fallId = ''
  let fallNummer: string | null = null
  if (!sceneNeedsLeadOnly) {
    const fallNummerSeed = `SMOKE-LC-${nr}-${Date.now().toString().slice(-5)}`
    const { data: fall, error: fallErr } = await db.from('faelle').insert({
      claim_id: claimId,
      lead_id: leadId,
      kunde_id: KUNDE_ID,
      sv_id: SV_ID,
      // CMM-44 SP-A: kundenbetreuer_id ist DUP-Spalte — nur noch in claims
      // (oben im claims-Insert via KB_ID gesetzt).
      fall_nummer: fallNummerSeed,
      schadens_datum: '2026-04-15',
      schadens_ort: 'Berlin',
      schadens_plz: '10115',
      schadens_ursache: 'unfall',
      kennzeichen: `B-SMOKE-${nr}`,
      fahrzeug_hersteller: 'BMW',
      fahrzeug_modell: 'X3',
      besichtigungsort_adresse: 'Teststraße 12, 10115 Berlin',
      onboarding_complete: !isErfassung,
      status: deriveFallStatus(scenarioKey),
    }).select('id, fall_nummer').single()
    if (fallErr || !fall) throw new Error(`fall insert: ${fallErr?.message ?? 'kein fall'}`)
    fallId = fall.id as string
    fallNummer = (fall.fall_nummer as string | null) ?? null

    // 4) Auftraege + Termine
    await seedAuftragArtefakte(db, scenarioKey, fallId, claimId)
  }

  return { scenarioKey, claimId, fallId, fallNummer }
}

function derivePhaseStatus(key: string): { phase: string; status: string } {
  switch (key) {
    case 'erfassung-sa-offen':
    case 'erfassung-vollmacht-offen':
    case 'erfassung-onboarding-offen':
      return { phase: '0_lead', status: 'dispatch_done' }
    case 'begutachtung-termin':
    case 'begutachtung-besichtigung':
      return { phase: '3_gutachter_unterwegs', status: 'in_bearbeitung' }
    case 'begutachtung-gutachten-qc':
    case 'begutachtung-reject':
      return { phase: '4_gutachten_fertig', status: 'in_bearbeitung' }
    case 'regulierung-vs-kontakt':
      return { phase: '6_kommunikation_versicherung', status: 'in_kommunikation_vs' }
    case 'regulierung-auszahlung':
    case 'abschluss':
      return { phase: '9_reguliert', status: 'reguliert' }
    default:
      return { phase: '1_neu', status: 'dispatch_done' }
  }
}

function deriveFallStatus(key: string): string {
  if (key === 'abschluss') return 'abgeschlossen'
  if (key.startsWith('regulierung')) return 'regulierung'
  if (key.startsWith('begutachtung')) return 'begutachtung'
  return 'ersterfassung'
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
    scenarioKey === 'abschluss'

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
    abgeschlossen_am: scenarioKey === 'abschluss' ? new Date().toISOString() : null,
  }).select('id').single()
  const auftragId = (auftrag?.id as string | undefined) ?? null

  // Termin für Begutachtungs-Szenarien
  if (scenarioKey === 'begutachtung-termin' || scenarioKey === 'begutachtung-besichtigung') {
    const startInTwoHours = new Date(Date.now() + 2 * 3600_000).toISOString()
    const svUnterwegsSeit = scenarioKey === 'begutachtung-besichtigung'
      ? new Date(Date.now() - 30 * 60_000).toISOString() : null
    await db.from('gutachter_termine').insert({
      fall_id: fallId,
      auftrag_id: auftragId,
      sv_id: SV_ID,
      status: 'bestaetigt',
      start_zeit: startInTwoHours,
      end_zeit: new Date(new Date(startInTwoHours).getTime() + 60 * 60_000).toISOString(),
      sv_unterwegs_seit: svUnterwegsSeit,
    })
  }

  // Kanzleifall + Auszahlung
  if (
    scenarioKey === 'regulierung-vs-kontakt' ||
    scenarioKey === 'regulierung-auszahlung' ||
    scenarioKey === 'abschluss'
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
