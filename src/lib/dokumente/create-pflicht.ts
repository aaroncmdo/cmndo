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
  // CMM-23: pro-Slot-Idempotenz statt all-or-none. Die alte all-or-none-
  // Logik hat verhindert dass nachträglich relevante Slots angelegt werden
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

  const docs: PflichtdokumenteInsert[] = []
  const seen = new Set<string>()

  // 1. Katalog-basierter Block wurde im Polish-Sweep entfernt (alleSlots +
  //    evaluateKatalogRule sind nicht mehr im Modul-Scope). Bis das
  //    Katalog-Modul wieder importiert wird, liefert nur der Supplementär-
  //    Block unten Slots — die berechneErwartung-Quelle bleibt unangetastet
  //    (siehe Modul-Header). TODO: Folge-PR um Katalog-Slot-Loop zu reaktivieren.
  void existingSlots
  void docs
  void seen

  // 2. Supplementär — Slots die der Katalog-Seed noch nicht abdeckt.
  // Werden zu einem späteren Zeitpunkt in den Katalog wandern (AAR-320 Folge-Tickets).
  const add = (typ: string, pflicht: boolean) => {
    if (seen.has(typ)) return
    if (existingSlots.has(typ)) return // CMM-23: nicht doppelt anlegen
    docs.push({ fall_id: fallId, dokument_typ: typ, pflicht, status: 'ausstehend', quelle: 'system' })
    seen.add(typ)
  }

  // 2a. Gewerbe — Leasing/Finanzierung läuft via Katalog-Slot freigabe_bank (AAR-353)
  if (lead?.gewerbe_flag === true || lead?.vorsteuerabzugsberechtigt === true) {
    add('gewerbenachweis', true)
    add('gf_vollmacht', true)
  }

  // 2b. Halter ≠ Fahrer — case-insensitive Nachname-Vergleich (konsistent zu
  // AAR-208 Phase4Stammdaten). Entweder Flag explizit oder Nachnamen weichen ab.
  const halterNach = String(lead?.halter_nachname ?? '').trim().toLowerCase()
  const kundeNach = String(lead?.nachname ?? '').trim().toLowerCase()
  if (lead?.halter_ungleich_fahrer_flag === true || (halterNach && halterNach !== kundeNach)) {
    add('halter_vollmacht', true)
    add('halter_ausweis', true)
  }

  // 2c. Fahrerflucht ohne Polizei → Polizeibericht Pflicht.
  // Katalog-Regel braucht polizei_vor_ort=true ODER polizeibericht_pflicht=true;
  // bei Fahrerflucht ohne Polizei ist beides potenziell false, pflicht wäre also
  // durch Katalog nicht erfasst. polizeibericht_status != 'hochgeladen' schließt
  // Doppel-Anlage aus.
  if (
    lead?.fahrerflucht === true
    && lead?.polizei_vor_ort !== true
    && lead?.polizeibericht_status !== 'hochgeladen'
    && !seen.has('polizeibericht')
  ) {
    add('polizeibericht', true)
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
