// AAR-311: Manueller Cardentity-Typ-B-Detailbericht.
// AAR-653: Writes jetzt auf `faelle` (Single Source of Truth nach AAR-580/582).
//
// Typ-A (automatisch via FIN-OCR) bleibt in enrich-fahrzeug.ts. Typ-B wird
// nur manuell von Dispatcher / KB / SV in der Fallakte ausgelöst — der Aufruf
// kostet 15€ pro Abfrage und ist erst nach dem Termin oder bei konkretem
// Vorschadenverdacht sinnvoll.
//
// Speicherung der Wahrheit: faelle-Tabelle (vorschaden_typ_b_bericht jsonb).
// Bei Trigger aus dem Lead-Dispatch wird der zugehörige Fall aufgelöst —
// wenn ein Lead noch keinen Fall hat, ist Typ-B nicht sinnvoll abfragbar
// (ohne FIN und ohne Besichtigung hat man keine Grundlage).

import { createAdminClient } from '@/lib/supabase/admin'
import { getVehicleReport, CardentityError, type CardentityReport } from './client'

export type RequestTypBResult =
  | {
      success: true
      alreadyFetched: boolean
      fetchedAt: string
      vorschadenVorhanden: boolean
      vorschadenAnzahl: number
      letzterVorschadenDatum: string | null
    }
  | { success: false; error: string; code?: number }

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

export async function requestCardentityTypB(
  scope: 'lead' | 'fall',
  id: string,
): Promise<RequestTypBResult> {
  const db = createAdminClient()

  // ─── Lead-Scope: Fall auflösen oder direkt auf Lead-FIN arbeiten ────────────
  if (scope === 'lead') {
    return requestCardentityTypBForLead(db, id)
  }

  // ─── Fall-Scope ──────────────────────────────────────────────────────────────
  return requestCardentityTypBForFall(db, id)
}

async function requestCardentityTypBForLead(
  db: ReturnType<typeof createAdminClient>,
  leadId: string,
): Promise<RequestTypBResult> {
  // Lead laden — FIN + Idempotenz-Check
  const { data: lead } = await db
    .from('leads')
    .select('id, fin, kilometerstand, erstzulassung, hat_vorschaeden, cardentity_report')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const leadFin = ((lead.fin as string | null) ?? '').trim().toUpperCase()

  // Neuesten Fall versuchen — wenn vorhanden, über Fall-Pfad laufen (Ergebnis dort persistieren)
  const { data: fall } = await db
    .from('faelle')
    .select('id')
    .eq('lead_id', leadId)
    .order('erstellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (fall) {
    return requestCardentityTypBForFall(db, fall.id as string, leadFin || undefined)
  }

  // Kein Fall → direkt mit Lead-FIN arbeiten
  if (!leadFin) {
    return { success: false, error: 'Keine FIN auf dem Lead eingetragen — bitte FIN erfassen' }
  }
  if (!VIN_REGEX.test(leadFin)) {
    return { success: false, error: `FIN „${leadFin}" ist ungültig (erwartet: 17 Zeichen A-Z/0-9, kein I/O/Q)` }
  }

  // Idempotenz: Typ-B-Ergebnis schon im cardentity_report auf dem Lead?
  const cachedReport = lead.cardentity_report as (Record<string, unknown> & { typB?: boolean }) | null
  if (cachedReport?.typB && cachedReport.fetchedAt) {
    const events = Array.isArray(cachedReport.events) ? cachedReport.events : []
    return {
      success: true,
      alreadyFetched: true,
      fetchedAt: cachedReport.fetchedAt as string,
      vorschadenVorhanden: (lead.hat_vorschaeden as boolean | null) ?? false,
      vorschadenAnzahl: events.length,
      letzterVorschadenDatum: events.reduce<string | null>((acc, e) => {
        const d = (e as Record<string, unknown>).date as string | undefined
        return d && (!acc || d > acc) ? d : acc
      }, null),
    }
  }

  try {
    const report = await getVehicleReport(leadFin, {
      mileage: (lead.kilometerstand as number | null) ?? undefined,
      firstRegistrationDate: (lead.erstzulassung as string | null) ?? undefined,
    })
    if (!report) {
      return { success: false, error: `FIN ${leadFin}: Kein Typ-B-Bericht verfügbar`, code: 404 }
    }

    const events = Array.isArray(report.events) ? report.events : []
    const vorschadenAnzahl = events.length
    const vorschadenVorhanden = vorschadenAnzahl > 0
    const letzterDatum = events.reduce<string | null>(
      (acc, e) => (e?.date && (!acc || e.date > acc) ? e.date : acc),
      null,
    )
    const fetchedAt = new Date().toISOString()

    // Auf Lead persistieren: cardentity_report mit typB-Flag + hat_vorschaeden
    await db.from('leads').update({
      cardentity_report: { ...(report as CardentityReport), fetchedAt, typB: true },
      hat_vorschaeden: vorschadenVorhanden,
      cardentity_enriched_at: fetchedAt,
    }).eq('id', leadId)

    return { success: true, alreadyFetched: false, fetchedAt, vorschadenVorhanden, vorschadenAnzahl, letzterVorschadenDatum: letzterDatum }
  } catch (err) {
    const finCtx = `(FIN ${leadFin})`
    if (err instanceof CardentityError) return { success: false, error: `${err.message} ${finCtx}`, code: err.status }
    return { success: false, error: `${err instanceof Error ? err.message : String(err)} ${finCtx}` }
  }
}

async function requestCardentityTypBForFall(
  db: ReturnType<typeof createAdminClient>,
  fallId: string,
  leadFinHint?: string,
): Promise<RequestTypBResult> {
  const { data: fall } = await db
    .from('faelle')
    .select(
      'id, fin_vin, vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, kilometerstand, erstzulassung',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  // FIN: zuerst aus dem Fall, Fallback auf den Lead-Hint (wenn vom Lead-Pfad übergeben)
  const fin = (((fall.fin_vin as string | null) ?? leadFinHint ?? '').trim().toUpperCase())
  if (!fin) return { success: false, error: 'Keine FIN vorhanden — bitte FIN im Lead/Fall erfassen' }
  if (!VIN_REGEX.test(fin)) {
    return { success: false, error: `FIN „${fin}" ist ungültig (erwartet: 17 Zeichen A-Z/0-9, kein I/O/Q)` }
  }

  // Idempotenz
  if (fall.vorschaden_typ_b_bericht) {
    const bericht = fall.vorschaden_typ_b_bericht as Record<string, unknown>
    return {
      success: true,
      alreadyFetched: true,
      fetchedAt: (bericht.fetchedAt as string) ?? '',
      vorschadenVorhanden: fall.hat_vorschaeden ?? false,
      vorschadenAnzahl: fall.vorschaden_anzahl ?? 0,
      letzterVorschadenDatum: (fall.vorschaden_letzter_datum as string | null) ?? null,
    }
  }

  try {
    const report = await getVehicleReport(fin, {
      mileage: (fall.kilometerstand as number | null) ?? undefined,
      firstRegistrationDate: (fall.erstzulassung as string | null) ?? undefined,
    })
    if (!report) return { success: false, error: `FIN ${fin}: Kein Typ-B-Bericht verfügbar`, code: 404 }

    const events = Array.isArray(report.events) ? report.events : []
    const vorschadenAnzahl = events.length
    const vorschadenVorhanden = vorschadenAnzahl > 0
    const letzterDatum = events.reduce<string | null>(
      (acc, e) => (e?.date && (!acc || e.date > acc) ? e.date : acc),
      null,
    )
    const fetchedAt = new Date().toISOString()

    const updates: Record<string, unknown> = {
      vorschaden_typ_b_bericht: { ...(report as CardentityReport), fetchedAt },
      vorschaden_geprueft: true,
      hat_vorschaeden: vorschadenVorhanden,
      vorschaden_anzahl: vorschadenAnzahl,
      cardentity_abfrage_am: fetchedAt,
    }
    if (letzterDatum) updates.vorschaden_letzter_datum = letzterDatum

    const { error: updErr } = await db.from('faelle').update(updates).eq('id', fallId)
    if (updErr) return { success: false, error: updErr.message }

    return { success: true, alreadyFetched: false, fetchedAt, vorschadenVorhanden, vorschadenAnzahl, letzterVorschadenDatum: letzterDatum }
  } catch (err) {
    const finCtx = `(FIN ${fin})`
    if (err instanceof CardentityError) return { success: false, error: `${err.message} ${finCtx}`, code: err.status }
    return { success: false, error: `${err instanceof Error ? err.message : String(err)} ${finCtx}` }
  }
}
