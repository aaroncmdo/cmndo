'use server'

import { createClient } from '@/lib/supabase/server'
import { schritt2cSchema, type Schritt2cInput } from '@/lib/flow/schemas/schritt2c'
import { assertLeadMutable } from './_helpers/assert-lead-mutable'

// AAR-474 C8: Server-Action — schreibt die Gegner-Daten in `leads`. Validiert
// server-seitig mit demselben Zod-Schema wie der Client. Rückgabe-Kontrakt wie
// alle Flow-Actions: { success, error? }.

type Result = { success: true } | { success: false; error: string }

export async function updateLeadGegner(
  leadId: string,
  input: Schritt2cInput,
): Promise<Result> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }

  const parsed = schritt2cSchema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return {
      success: false,
      error: first?.message ?? 'Validierung fehlgeschlagen',
    }
  }

  const d = parsed.data
  const supabase = await createClient()

  // 13.05.2026 Auth-Audit-Fix: Lead muss noch in der Public-Flow-Phase sein.
  // Verhindert dass eine anon-Session einen längst abgeschlossenen Fall ändert.
  const guard = await assertLeadMutable(supabase, leadId, 'updateLeadGegner')
  if (!guard.ok) return { success: false, error: guard.error }

  const { error } = await supabase
    .from('leads')
    .update({
      gegner_name: d.gegner_name?.trim() || null,
      gegner_kennzeichen: d.gegner_kennzeichen?.trim() || null,
      gegner_versicherung_id: d.gegner_versicherung_id ?? null,
      gegner_schadennummer: d.gegner_schadennummer?.trim() || null,
      zeugen_kontakte: d.zeugen_kontakte,
      zeugen: d.zeugen_kontakte.length > 0,
      fahrerflucht: d.fahrerflucht,
      auslandskennzeichen: d.auslandskennzeichen,
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
