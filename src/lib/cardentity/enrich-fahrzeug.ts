'use server'

// AAR-84: Lead/Fall by FIN per Cardentity anreichern.
// Wird aufgerufen aus FlowWizard und Dispatch-Qualifizierung.

import { createAdminClient } from '@/lib/supabase/admin'
import { checkVinAvailability, getVehicleReport, CardentityError } from './client'

export type EnrichResult =
  | { success: true; updatedFields: string[] }
  | { success: false; error: string; code?: number }

const VIN_REGEX = /^[A-HJ-NPR-Z0-9]{17}$/

/**
 * Reichert ein Lead via Cardentity an. Idempotent: ueberschreibt nur leere Felder.
 */
export async function enrichLeadByFin(leadId: string): Promise<EnrichResult> {
  return enrichByFin('leads', leadId)
}

export async function enrichFallByFin(fallId: string): Promise<EnrichResult> {
  return enrichByFin('faelle', fallId)
}

async function enrichByFin(
  table: 'leads' | 'faelle',
  id: string,
): Promise<EnrichResult> {
  const db = createAdminClient()

  const finCol = table === 'faelle' ? 'fin_vin' : 'fin'
  const { data: row, error: fetchErr } = await db
    .from(table)
    .select(`id, ${finCol}, fahrzeug_hersteller, fahrzeug_modell, erstzulassung, kilometerstand, cardentity_enriched_at`)
    .eq('id', id)
    .single()

  if (fetchErr || !row) return { success: false, error: 'Datensatz nicht gefunden' }
  const r = row as unknown as Record<string, unknown>

  const fin = (r[finCol] as string | null)?.trim().toUpperCase() ?? null
  if (!fin) return { success: false, error: 'Keine FIN vorhanden' }
  if (!VIN_REGEX.test(fin)) return { success: false, error: 'FIN-Format ungueltig' }

  // Idempotenz: bereits angereichert?
  if (r.cardentity_enriched_at) return { success: true, updatedFields: [] }

  try {
    const available = await checkVinAvailability(fin)
    if (!available) return { success: false, error: 'Fahrzeug nicht in Cardentity vorhanden', code: 404 }

    const km = r.kilometerstand as number | null
    const erstzulassung = r.erstzulassung as string | null
    const report = await getVehicleReport(fin, {
      mileage: km ?? undefined,
      firstRegistrationDate: erstzulassung ?? undefined,
    })
    if (!report) return { success: false, error: 'Kein Report verfuegbar', code: 404 }

    // Update nur leere Felder
    const updates: Record<string, unknown> = {
      cardentity_enriched_at: new Date().toISOString(),
      cardentity_report: report,
    }
    if (!r.fahrzeug_hersteller && report.make) updates.fahrzeug_hersteller = report.make
    if (!r.fahrzeug_modell && report.model) updates.fahrzeug_modell = report.model
    if (!r.erstzulassung && report.firstRegistrationDate) updates.erstzulassung = report.firstRegistrationDate
    if (report.equipment) updates.fahrzeug_ausstattung = report.equipment

    const { error: updErr } = await db.from(table).update(updates).eq('id', id)
    if (updErr) return { success: false, error: updErr.message }

    return {
      success: true,
      updatedFields: Object.keys(updates).filter(k => k !== 'cardentity_report' && k !== 'cardentity_enriched_at'),
    }
  } catch (err) {
    if (err instanceof CardentityError) {
      return { success: false, error: err.message, code: err.status }
    }
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
