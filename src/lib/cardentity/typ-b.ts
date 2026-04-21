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

  let fallId: string | null = null

  if (scope === 'fall') {
    fallId = id
  } else {
    // Lead → neusten Fall auflösen
    const { data: fall } = await db
      .from('faelle')
      .select('id')
      .eq('lead_id', id)
      .order('erstellt_am', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!fall) return { success: false, error: 'Kein Fall zum Lead — Typ-B erst nach Fallanlage abrufbar' }
    fallId = fall.id
  }

  const { data: fall } = await db
    .from('faelle')
    .select(
      'id, fin_vin, vorschaden_typ_b_bericht, hat_vorschaeden, vorschaden_anzahl, vorschaden_letzter_datum, kilometerstand, erstzulassung',
    )
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { success: false, error: 'Fall nicht gefunden' }

  const fin = ((fall.fin_vin as string | null) ?? '').trim().toUpperCase()
  if (!fin) return { success: false, error: 'Keine FIN vorhanden' }
  if (!VIN_REGEX.test(fin)) return { success: false, error: 'FIN-Format ungültig' }

  // Idempotenz: wenn schon abgerufen, nur Stand zurückgeben — keine 2. Abfrage
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

    const { error: updErr } = await db.from('faelle').update(updates).eq('id', fallId)
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
