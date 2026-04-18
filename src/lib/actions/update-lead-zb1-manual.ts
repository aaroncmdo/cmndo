'use server'

import { createClient } from '@/lib/supabase/server'
import { zb1Schema, type Zb1FormValues } from '@/lib/flow/schemas/schritt3'

// AAR-475 C9: Server-Action für den ZB1-Submit — deckt beide Pfade ab:
// (a) OCR-Preview wurde vom User bestätigt/korrigiert,
// (b) User hat manuell ohne Scan eingetippt.
// Beide Pfade schreiben dieselben Felder in `leads`.

type Result = { success: true } | { success: false; error: string }

export async function updateLeadZb1Manual(
  leadId: string,
  input: Zb1FormValues,
  manual: boolean,
): Promise<Result> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }

  const parsed = zb1Schema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { success: false, error: first?.message ?? 'Validierung fehlgeschlagen' }
  }
  const d = parsed.data

  const supabase = await createClient()
  const { error } = await supabase
    .from('leads')
    .update({
      hsn: d.hsn,
      tsn: d.tsn.toUpperCase(),
      fin: d.fin.toUpperCase(),
      erstzulassung: d.erstzulassung,
      kennzeichen: d.kennzeichen?.trim() || null,
      zb1_ocr_daten: {
        manual,
        submitted_at: new Date().toISOString(),
        source: manual ? 'manuell' : 'ocr-confirmed',
      },
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  return { success: true }
}
