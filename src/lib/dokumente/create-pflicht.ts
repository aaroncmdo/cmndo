// Lead-Bucket → Claim-Bucket Transfer.
//
// Liest die Erwartung deterministisch aus berechneErwartung() (Lead-Flags
// → Slot-Liste) und legt für jeden erwarteten Slot eine pflichtdokumente-
// Zeile an, die noch nicht existiert. Eine Quelle der Wahrheit für „welche
// Dokumente erwartet werden" — keine doppelte Logik mehr in Katalog-DSL +
// Supplementär-Block.
//
// Idempotent: bestehende Slots werden nicht überschrieben oder dupliziert.
// Aufrufbar nach Lead→Fall-Konvertierung und nach Lead-Flag-Updates (z.B.
// wenn der KB nachträglich personenschaden_flag setzt).

import type { SupabaseClient } from '@supabase/supabase-js'
import { berechneErwartung } from './erwartung'

type PflichtdokumenteInsert = {
  fall_id: string
  dokument_typ: string
  pflicht: boolean
  status: string
  quelle: string
}

export async function createPflichtdokumenteFromKatalog(
  supabase: SupabaseClient,
  fallId: string,
  lead: Record<string, unknown> | null | undefined,
  fall?: Record<string, unknown> | null,
): Promise<void> {
  // Bestehende Slots holen — pro-Slot-Idempotenz.
  const { data: existingRows } = await supabase
    .from('pflichtdokumente')
    .select('dokument_typ')
    .eq('fall_id', fallId)
  const existingSlots = new Set(
    (existingRows ?? []).map((r) => r.dokument_typ as string),
  )

  // Fall-Felder überschreiben Lead-Felder (Fall = aktueller Stand).
  const merged = {
    ...(lead ?? {}),
    ...Object.fromEntries(
      Object.entries(fall ?? {}).filter(([, v]) => v !== null && v !== undefined),
    ),
  }
  const erwartet = berechneErwartung(merged as Parameters<typeof berechneErwartung>[0])

  const docs: PflichtdokumenteInsert[] = []
  for (const slot of erwartet) {
    if (existingSlots.has(slot.slot_id)) continue
    docs.push({
      fall_id: fallId,
      dokument_typ: slot.slot_id,
      pflicht: slot.pflicht,
      status: 'ausstehend',
      quelle: 'system',
    })
  }

  if (docs.length === 0) return
  await supabase.from('pflichtdokumente').insert(docs)

  // AAR-623: Konditionale WA-Tasks für freigabe_bank + zeugenbericht
  // triggern — nur für Slots die gerade frisch angelegt wurden.
  try {
    const { triggerKonditionaleDokumentTasks } = await import('./konditional-tasks')
    const insertedSlots = docs.map((d) => d.dokument_typ)
    await triggerKonditionaleDokumentTasks(supabase, fallId, insertedSlots)
  } catch (err) {
    console.error('[AAR-623] triggerKonditionaleDokumentTasks failed:', err)
  }
}
