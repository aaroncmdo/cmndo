'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { zb1Schema, type Zb1FormValues } from '@/lib/flow/schemas/schritt3'
import { assertLeadMutable } from './_helpers/assert-lead-mutable'

// AAR-475 C9: Server-Action für den ZB1-Submit — deckt beide Pfade ab:
// (a) OCR-Preview wurde vom User bestätigt/korrigiert,
// (b) User hat manuell ohne Scan eingetippt.
// Beide Pfade schreiben dieselben Felder in `leads`.

type HalterDaten = {
  vorname: string
  nachname: string
  strasse: string
  plz: string
  stadt: string
}

type Result = { success: true } | { success: false; error: string }

export async function updateLeadZb1Manual(
  leadId: string,
  input: Zb1FormValues,
  manual: boolean,
  halter?: HalterDaten,
): Promise<Result> {
  if (!leadId) return { success: false, error: 'Lead-ID fehlt' }

  const parsed = zb1Schema.safeParse(input)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return { success: false, error: first?.message ?? 'Validierung fehlgeschlagen' }
  }
  const d = parsed.data

  const supabase = await createClient()

  // 13.05.2026 Auth-Audit-Fix: State-Guard für anon-Mutation (siehe
  // _helpers/assert-lead-mutable.ts).
  const guard = await assertLeadMutable(supabase, leadId, 'updateLeadZb1Manual')
  if (!guard.ok) return { success: false, error: guard.error }

  const halterUpdate =
    halter && (halter.vorname || halter.nachname)
      ? {
          halter_vorname: halter.vorname || null,
          halter_nachname: halter.nachname || null,
          halter_strasse: halter.strasse || null,
          halter_plz: halter.plz || null,
          halter_stadt: halter.stadt || null,
        }
      : {}

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
      ...halterUpdate,
    })
    .eq('id', leadId)

  if (error) return { success: false, error: error.message }
  // 13.05.2026 Server-Actions-Audit Fix: Dispatch nutzt ZB1-Daten + Halter-
  // Adresse fürs Lead-Routing. Ohne revalidate stale im Detail.
  revalidatePath('/dispatch/leads')
  revalidatePath(`/dispatch/leads/${leadId}`)
  return { success: true }
}
