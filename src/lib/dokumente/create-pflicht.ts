// Lead-Bucket → Claim-Bucket Transfer.
//
// Legt fuer jeden Katalog-Pflicht-Slot (SSoT: dokument_katalog) eine
// pflichtdokumente-Zeile an, die noch nicht existiert.
//
// Idempotent: bestehende Slots werden nicht ueberschrieben oder dupliziert.
// Aufrufbar nach Lead→Fall-Konvertierung und nach Lead-Flag-Updates (z.B.
// wenn der KB nachtraeglich personenschaden_flag setzt).

import type { SupabaseClient } from '@supabase/supabase-js'
import { getPflichtSlotsFuerFall } from './katalog'
import { buildDokumentKontext } from './build-kontext'

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
  // CMM-23: pro-Slot-Idempotenz statt all-or-none. Die alte all-or-none-
  // Logik hat verhindert dass nachtraeglich relevante Slots angelegt werden
  // (z.B. wenn KB im Lead personenschaden_flag=true setzt nach Conversion,
  // oder wenn Conversion nur einen Slot anlegen konnte). Jetzt: bestehende
  // Slots holen, nur die nachlegen die fehlen.
  const { data: existingRows } = await supabase
    .from('pflichtdokumente')
    .select('dokument_typ')
    .eq('fall_id', fallId)
  const existingSlots = new Set(
    (existingRows ?? []).map((r) => r.dokument_typ as string),
  )

  // Katalog-SSoT: Kontext aus Lead + Fall bauen, dann Pflicht-Slots auslesen.
  const ctx = buildDokumentKontext({ claim: fall ?? null, lead: lead ?? null })
  const pflichtSlots = await getPflichtSlotsFuerFall(supabase, ctx)

  const docs: PflichtdokumenteInsert[] = []
  const seen = new Set<string>()

  for (const slot of pflichtSlots) {
    if (seen.has(slot.slot_id)) continue
    if (existingSlots.has(slot.slot_id)) continue // CMM-23: nicht doppelt anlegen
    docs.push({
      fall_id: fallId,
      dokument_typ: slot.slot_id,
      pflicht: true,
      status: 'ausstehend',
      quelle: 'system',
    })
    seen.add(slot.slot_id)
  }

  if (docs.length === 0) return
  await supabase.from('pflichtdokumente').insert(docs)

  // AAR-623: Konditionale WA-Tasks fuer freigabe_bank + zeugenbericht
  // triggern — nur fuer Slots die gerade frisch angelegt wurden.
  try {
    const { triggerKonditionaleDokumentTasks } = await import('./konditional-tasks')
    const insertedSlots = docs.map((d) => d.dokument_typ)
    await triggerKonditionaleDokumentTasks(supabase, fallId, insertedSlots)
  } catch (err) {
    console.error('[AAR-623] triggerKonditionaleDokumentTasks failed:', err)
  }
}
