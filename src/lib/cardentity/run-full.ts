// CMM-64 / Cardentity scharf (2026-05-31): EINE manuelle Abfrage, beide Outcomes.
//
// Ein getVehicleReport-Pull (kostenpflichtig, ~15 EUR) liefert BEIDES:
//   - Fahrzeug-Stammdaten (make/model/equipment)  -> vehicles (via ensureVehicleFromFin)
//   - Vorschaden-Events                           -> vehicle_vorschaeden + claims-Flags
//
// Ersetzt die alten getrennten Pfade lib/cardentity/typ-b.ts + enrich-fahrzeug.ts.
// KEIN Auto-Fire mehr — nur manuell aus dispatch/KB/admin/SV (claim/vehicle-gebunden).
// Aaron-Entscheidung 31.05.: "ein Button der beide macht, erst Fahrzeugdaten dann
// Vorschaden, manuell ausgeloest".
//
// Datenziel (CMM-64 PR1-Schema, live):
//   vehicles.cardentity_report (jsonb) + vehicles.cardentity_letzter_pull
//   vehicle_vorschaeden (1:N pro Fahrzeug, quelle='cardentity')
//   claims.hat_vorschaeden / vorschaden_geprueft / vorschaden_erkannt
// Lead-ohne-Claim: leads.cardentity_report/hat_vorschaeden + vehicle (pre-claim).

import { createAdminClient } from '@/lib/supabase/admin'
import { ensureVehicleFromFin } from '@/lib/vehicles/ensure-vehicle'
import { getVehicleReport, CardentityError, type CardentityReport } from './client'

export type CardentityRunResult =
  | {
      success: true
      alreadyFetched: boolean
      fetchedAt: string
      vehicleFieldsUpdated: string[]
      vorschadenVorhanden: boolean
      vorschadenAnzahl: number
      letzterVorschadenDatum: string | null
    }
  | { success: false; error: string; code?: number }

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

type DB = ReturnType<typeof createAdminClient>

/** Vorschaden-Event aus dem Cardentity-Report. */
type ReportEvent = { type?: string; date?: string; mileage?: number; [k: string]: unknown }

function summarizeEvents(report: CardentityReport): {
  events: ReportEvent[]
  anzahl: number
  vorhanden: boolean
  letzterDatum: string | null
} {
  const events: ReportEvent[] = Array.isArray(report.events) ? (report.events as ReportEvent[]) : []
  const letzterDatum = events.reduce<string | null>(
    (acc, e) => (e?.date && (!acc || e.date > acc) ? e.date : acc),
    null,
  )
  return { events, anzahl: events.length, vorhanden: events.length > 0, letzterDatum }
}

/**
 * Schreibt den Report vehicle-gebunden: Fahrzeugdaten (via ensureVehicleFromFin)
 * + cardentity_report + vehicle_vorschaeden (replace fuer quelle='cardentity').
 * Liefert die vehicleId (oder null bei Fehler). Alle Writes non-fatal.
 */
async function persistVehicleSide(
  db: DB,
  fin: string,
  report: CardentityReport,
  fetchedAt: string,
): Promise<{ vehicleId: string | null; vehicleFieldsUpdated: string[] }> {
  const vehicleFieldsUpdated: string[] = []
  let vehicleId: string | null = null

  try {
    const veh = await ensureVehicleFromFin({
      fin,
      snapshot: {
        hersteller: (report.make as string | undefined) ?? null,
        modell: (report.model as string | undefined) ?? null,
        erstzulassung: (report.firstRegistrationDate as string | undefined) ?? null,
        ausstattung: report.equipment ?? null,
        finQuelle: 'cardentity',
        finExtrahiertAm: fetchedAt,
      },
      db,
    })
    if (!veh.ok) {
      console.warn('[cardentity/run-full] ensureVehicleFromFin:', veh.error)
      return { vehicleId: null, vehicleFieldsUpdated }
    }
    vehicleId = veh.vehicleId
    if (report.make) vehicleFieldsUpdated.push('hersteller')
    if (report.model) vehicleFieldsUpdated.push('modell')
    if (report.firstRegistrationDate) vehicleFieldsUpdated.push('erstzulassung')
    if (report.equipment) vehicleFieldsUpdated.push('ausstattung')
  } catch (e) {
    console.warn('[cardentity/run-full] ensureVehicleFromFin exception:', e)
    return { vehicleId: null, vehicleFieldsUpdated }
  }

  // cardentity_report + Pull-Zeitpunkt auf vehicles
  try {
    await db
      .from('vehicles')
      .update({ cardentity_report: { ...(report as CardentityReport), fetchedAt, typB: true }, cardentity_letzter_pull: fetchedAt })
      .eq('id', vehicleId)
  } catch (e) {
    console.warn('[cardentity/run-full] vehicles.cardentity_report:', e)
  }

  // vehicle_vorschaeden: quelle='cardentity' ersetzen (idempotent pro Pull)
  try {
    const { events } = summarizeEvents(report)
    await db.from('vehicle_vorschaeden').delete().eq('vehicle_id', vehicleId).eq('quelle', 'cardentity')
    if (events.length > 0) {
      await db.from('vehicle_vorschaeden').insert(
        events.map((e) => ({
          vehicle_id: vehicleId,
          schaden_datum: e.date ?? null,
          art: (e.type as string | undefined) ?? null,
          quelle: 'cardentity',
          rohdaten: e as Record<string, unknown>,
        })),
      )
    }
  } catch (e) {
    console.warn('[cardentity/run-full] vehicle_vorschaeden:', e)
  }

  return { vehicleId, vehicleFieldsUpdated }
}

/** Setzt vehicle_id auf der Ziel-Row (claims/leads) wenn noch leer. Non-fatal. */
async function linkVehicleIfEmpty(db: DB, table: 'claims' | 'leads', id: string, vehicleId: string | null) {
  if (!vehicleId) return
  try {
    const { data } = await db.from(table).select('vehicle_id').eq('id', id).maybeSingle()
    if (data && !(data as { vehicle_id: string | null }).vehicle_id) {
      await db.from(table).update({ vehicle_id: vehicleId }).eq('id', id)
    }
  } catch (e) {
    console.warn(`[cardentity/run-full] ${table}.vehicle_id link:`, e)
  }
}

async function runForFall(db: DB, fallId: string, finHint?: string): Promise<CardentityRunResult> {
  // CMM-49: vehicle-Felder (fin_vin/kilometerstand/erstzulassung) entity-sourced via
  // v_claim_full (Plan 4, LOSS=0 verifiziert). Reine USE-Read (FIN + Context fuer die
  // Cardentity-API, KEIN faelle->vehicles-Seed). Alias id:fall_id + claim_id:id erhaelt
  // das faelle-Shape → Downstream (fall.claim_id/fin_vin/kilometerstand/erstzulassung) unveraendert.
  const { data: fall } = await db
    .from('v_claim_full')
    .select('id:fall_id, fin_vin, claim_id:id, kilometerstand, erstzulassung')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const claimId = (fall.claim_id as string | null) ?? null
  const fin = (((fall.fin_vin as string | null) ?? finHint ?? '').trim().toUpperCase())
  if (!fin) return { success: false, error: 'Keine FIN vorhanden — bitte FIN im Lead/Fall erfassen' }
  if (!VIN_REGEX.test(fin)) {
    return { success: false, error: `FIN „${fin}" ist ungültig (erwartet: 17 Zeichen A-Z/0-9, kein I/O/Q)` }
  }

  // Idempotenz: liegt schon ein typB-Report auf dem verknuepften Fahrzeug?
  if (claimId) {
    const { data: claim } = await db.from('claims').select('vehicle_id').eq('id', claimId).maybeSingle()
    const vehId = (claim as { vehicle_id: string | null } | null)?.vehicle_id ?? null
    if (vehId) {
      const { data: veh } = await db.from('vehicles').select('cardentity_report').eq('id', vehId).maybeSingle()
      const rep = (veh as { cardentity_report: (CardentityReport & { typB?: boolean; fetchedAt?: string }) | null } | null)?.cardentity_report
      if (rep?.typB && rep.fetchedAt) {
        const s = summarizeEvents(rep)
        return { success: true, alreadyFetched: true, fetchedAt: rep.fetchedAt, vehicleFieldsUpdated: [], vorschadenVorhanden: s.vorhanden, vorschadenAnzahl: s.anzahl, letzterVorschadenDatum: s.letzterDatum }
      }
    }
  }

  let report: CardentityReport | null
  try {
    report = await getVehicleReport(fin, {
      mileage: (fall.kilometerstand as number | null) ?? undefined,
      firstRegistrationDate: (fall.erstzulassung as string | null) ?? undefined,
    })
  } catch (err) {
    const finCtx = `(FIN ${fin})`
    if (err instanceof CardentityError) return { success: false, error: `${err.message} ${finCtx}`, code: err.status }
    return { success: false, error: `${err instanceof Error ? err.message : String(err)} ${finCtx}` }
  }
  if (!report) return { success: false, error: `FIN ${fin}: Kein Cardentity-Report verfügbar`, code: 404 }

  const fetchedAt = new Date().toISOString()
  const { vehicleId, vehicleFieldsUpdated } = await persistVehicleSide(db, fin, report, fetchedAt)
  await linkVehicleIfEmpty(db, 'claims', claimId ?? '', vehicleId)

  const s = summarizeEvents(report)

  // claim-zeitige Vorschaden-Flags (claim-gebunden)
  if (claimId) {
    try {
      // Das umgebende try faengt hier nichts (supabase-js wirft nicht). Ohne diese
      // Flags gilt der Vorschaden als ungeprueft — die Abfrage war aber schon
      // kostenpflichtig und wird beim naechsten Mal erneut ausgeloest.
      const { error: flagsFehler } = await db.from('claims').update({ hat_vorschaeden: s.vorhanden, vorschaden_geprueft: true, vorschaden_erkannt: s.vorhanden }).eq('id', claimId)
      if (flagsFehler) {
        console.error(`[cardentity/run-full] Vorschaden-Flags nicht gesetzt (claim ${claimId}):`, flagsFehler.message)
      }
    } catch (e) {
      console.warn('[cardentity/run-full] claims flags:', e)
    }
  }

  // Timeline (fall_id bleibt bis Phase-6-Re-Key)
  try {
    await db.from('timeline').insert({
      fall_id: fallId,
      typ: 'vorschaden-bericht',
      titel: s.vorhanden ? `Cardentity: ${s.anzahl} Vorschaden-Eintrag${s.anzahl === 1 ? '' : 'e'}` : 'Cardentity: keine Vorschäden',
      beschreibung: `Manuelle Cardentity-Abfrage für FIN ${fin}. Fahrzeugdaten aktualisiert (${vehicleFieldsUpdated.join(', ') || 'keine'}). ${s.vorhanden ? `${s.anzahl} Vorschaden dokumentiert.` : 'Vorschadenfrei.'}`,
    })
  } catch (e) {
    console.warn('[cardentity/run-full] timeline:', e)
  }

  return { success: true, alreadyFetched: false, fetchedAt, vehicleFieldsUpdated, vorschadenVorhanden: s.vorhanden, vorschadenAnzahl: s.anzahl, letzterVorschadenDatum: s.letzterDatum }
}

async function runForLead(db: DB, leadId: string): Promise<CardentityRunResult> {
  const { data: lead } = await db
    .from('leads')
    .select('id, fin, kilometerstand, erstzulassung, cardentity_report')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  // Wenn der Lead bereits einen Fall hat: ueber den Fall-Pfad (claim-gebunden persistieren).
  // CMM-49 (faelle-Drop-Runway): lead->Fall via claims (SSoT fuer lead_id) + Bridge (fall_id==
  // faelle.id) statt .from('faelle'). REGRESSION-FIX: der alte Read ordnete nach faelle.erstellt_am
  // — diese Spalte existiert nicht (CMM-Rename -> created_at) -> die Query failte IMMER -> fall=null
  // -> lead-scoped Cardentity routete konvertierte Leads NIE auf den Fall-Pfad (lief faelschlich den
  // Lead-Pfad/lead.cardentity_report). 0 Leads mit >1 Fall -> Sortierung ohnehin value-irrelevant.
  const { data: leadClaim } = await db
    .from('claims')
    .select('id')
    .eq('lead_id', leadId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data: fall } = leadClaim?.id
    ? await db.from('faelle_claim_bridge').select('fall_id').eq('claim_id', leadClaim.id).maybeSingle()
    : { data: null }
  const leadFin = ((lead.fin as string | null) ?? '').trim().toUpperCase()
  if (fall) return runForFall(db, fall.fall_id as string, leadFin || undefined)

  if (!leadFin) return { success: false, error: 'Keine FIN auf dem Lead — bitte FIN erfassen' }
  if (!VIN_REGEX.test(leadFin)) {
    return { success: false, error: `FIN „${leadFin}" ist ungültig (erwartet: 17 Zeichen A-Z/0-9, kein I/O/Q)` }
  }

  // Idempotenz (Lead): typB-Report schon im lead.cardentity_report?
  const cached = lead.cardentity_report as (CardentityReport & { typB?: boolean; fetchedAt?: string }) | null
  if (cached?.typB && cached.fetchedAt) {
    const s = summarizeEvents(cached)
    return { success: true, alreadyFetched: true, fetchedAt: cached.fetchedAt, vehicleFieldsUpdated: [], vorschadenVorhanden: s.vorhanden, vorschadenAnzahl: s.anzahl, letzterVorschadenDatum: s.letzterDatum }
  }

  let report: CardentityReport | null
  try {
    report = await getVehicleReport(leadFin, {
      mileage: (lead.kilometerstand as number | null) ?? undefined,
      firstRegistrationDate: (lead.erstzulassung as string | null) ?? undefined,
    })
  } catch (err) {
    const finCtx = `(FIN ${leadFin})`
    if (err instanceof CardentityError) return { success: false, error: `${err.message} ${finCtx}`, code: err.status }
    return { success: false, error: `${err instanceof Error ? err.message : String(err)} ${finCtx}` }
  }
  if (!report) return { success: false, error: `FIN ${leadFin}: Kein Cardentity-Report verfügbar`, code: 404 }

  const fetchedAt = new Date().toISOString()
  const { vehicleId, vehicleFieldsUpdated } = await persistVehicleSide(db, leadFin, report, fetchedAt)
  await linkVehicleIfEmpty(db, 'leads', leadId, vehicleId)

  const s = summarizeEvents(report)
  // Lead-Snapshot (pre-claim): Report + Flag auf dem Lead
  try {
    // Der Report ist bereits abgerufen (kostenpflichtig). Geht dieser Write verloren,
    // ist die Abfrage bezahlt und das Ergebnis weg.
    const { error: reportFehler } = await db.from('leads').update({
      cardentity_report: { ...(report as CardentityReport), fetchedAt, typB: true },
      hat_vorschaeden: s.vorhanden,
      cardentity_enriched_at: fetchedAt,
    }).eq('id', leadId)
    if (reportFehler) {
      console.error(`[cardentity/run-full] Report NICHT gespeichert (lead ${leadId}) — Abfrage bezahlt, Ergebnis weg:`, reportFehler.message)
    }
  } catch (e) {
    console.warn('[cardentity/run-full] leads snapshot:', e)
  }

  return { success: true, alreadyFetched: false, fetchedAt, vehicleFieldsUpdated, vorschadenVorhanden: s.vorhanden, vorschadenAnzahl: s.anzahl, letzterVorschadenDatum: s.letzterDatum }
}

/**
 * Manuelle Cardentity-Komplettabfrage (Fahrzeugdaten + Vorschaden) in einem Call.
 * Admin-Client: Caller (Server-Action-Wrapper) hat zuvor die Rolle autorisiert.
 */
export async function runCardentityCheck(scope: 'fall' | 'lead', id: string): Promise<CardentityRunResult> {
  const db = createAdminClient()
  return scope === 'lead' ? runForLead(db, id) : runForFall(db, id)
}
