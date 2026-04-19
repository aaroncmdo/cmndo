// AAR-311: Manueller Cardentity-Typ-B-Detailbericht.
// Typ-A (automatisch via FIN-OCR) bleibt in enrich-fahrzeug.ts. Typ-B wird
// nur manuell von Dispatcher / KB / SV in der Fallakte ausgelöst — der Aufruf
// kostet 15€ pro Abfrage und ist erst nach dem Termin oder bei konkretem
// Vorschadenverdacht sinnvoll.
//
// Speicherung der Wahrheit: leads-Tabelle (vorschaden_typ_b_bericht jsonb).
// Bei Trigger aus der Fallakte wird die lead_id über faelle aufgelöst — so
// gibt es nur eine Quelle für Vorschaden-Daten.

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

  let leadId: string | null = null
  let finFromScope: string | null = null

  if (scope === 'fall') {
    const { data: fall } = await db
      .from('faelle')
      .select('lead_id, fin_vin')
      .eq('id', id)
      .maybeSingle()
    if (!fall) return { success: false, error: 'Fall nicht gefunden' }
    if (!fall.lead_id) return { success: false, error: 'Fall hat keinen Lead' }
    leadId = fall.lead_id
    finFromScope = (fall.fin_vin as string | null) ?? null
  } else {
    leadId = id
  }

  const { data: lead } = await db
    .from('leads')
    .select('id, fin, vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, kilometerstand, erstzulassung')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { success: false, error: 'Lead nicht gefunden' }

  const fin = ((finFromScope ?? lead.fin) ?? '').trim().toUpperCase()
  if (!fin) return { success: false, error: 'Keine FIN vorhanden' }
  if (!VIN_REGEX.test(fin)) return { success: false, error: 'FIN-Format ungültig' }

  // Idempotenz: wenn schon abgerufen, nur Stand zurückgeben — keine 2. Abfrage
  if (lead.vorschaden_typ_b_bericht) {
    const bericht = lead.vorschaden_typ_b_bericht as Record<string, unknown>
    return {
      success: true,
      alreadyFetched: true,
      fetchedAt: (bericht.fetchedAt as string) ?? '',
      vorschadenVorhanden: lead.hat_vorschaeden ?? false,
      vorschadenAnzahl: lead.vorschaden_anzahl ?? 0,
      letzterVorschadenDatum: (lead.vorschaden_letzter_datum as string | null) ?? null,
    }
  }

  try {
    const report = await getVehicleReport(fin, {
      mileage: (lead.kilometerstand as number | null) ?? undefined,
      firstRegistrationDate: (lead.erstzulassung as string | null) ?? undefined,
    })
    if (!report) return { success: false, error: 'Kein Bericht verfügbar', code: 404 }

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

    const { error: updErr } = await db.from('leads').update(updates).eq('id', leadId)
    if (updErr) return { success: false, error: updErr.message }

    return {
      success: true,
      alreadyFetched: false,
      fetchedAt,
      vorschadenVorhanden,
      vorschadenAnzahl,
      letzterVorschadenDatum: letzterDatum,
    }
  } catch (err) {
    if (err instanceof CardentityError) return { success: false, error: err.message, code: err.status }
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
