// AAR-322: Zentraler Pflichtdokumente-Erzeuger — ersetzt die zwei vorher
// duplizierten Implementierungen (createDefaultPflichtdokumente in
// flow/[token]/actions.ts + createPflichtdokumente in admin/dispatch/actions.ts).
//
// Quelle der Wahrheit ist der dokument_katalog mit JSON-Rule-DSL.
// AAR-353: Leasing-/Finanzierungsverträge ersetzt durch Katalog-Slot
// freigabe_bank (triggert auf finanzierung_leasing ∈ {leasing,finanzierung}).
// Supplementär bleiben nur Slots die (noch) nicht im Katalog sind:
// gewerbenachweis, gf_vollmacht, halter_vollmacht, halter_ausweis +
// Fahrerflucht-Polizeibericht.

import type { SupabaseClient } from '@supabase/supabase-js'
import { getAlleSlots } from './katalog'
import { buildKatalogContext, evaluateKatalogRule } from './ruleEvaluator'

type PflichtdokumenteInsert = {
  fall_id: string
  dokument_typ: string
  pflicht: boolean
  status: string
  quelle: string
}

/**
 * Legt für einen frisch erstellten Fall die passenden pflichtdokumente-Zeilen an.
 * Idempotent: macht nichts wenn bereits pflichtdokumente für den Fall existieren.
 *
 * @param supabase Admin- oder Service-Client (RLS bypassed oder mit passenden Rechten).
 * @param fallId UUID des Falls.
 * @param lead Lead-Spalten relevant für Rule-Evaluation (zb1_status, personenschaden_flag, ...).
 * @param fall Optional: Fall-Spalten für Rules die auf den Fall schauen (technische_stellungnahme_status, zeugen_vorhanden).
 */
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

  const ctx = buildKatalogContext({ lead, fall })
  const alleSlots = await getAlleSlots(supabase)
  const docs: PflichtdokumenteInsert[] = []
  const seen = new Set<string>()

  // 1. Katalog-basiert: Jeder freigeschaltete Slot wird als pflichtdokumente-
  //    Zeile angelegt — nur wenn er noch nicht existiert (CMM-23: pro-Slot-
  //    Idempotenz). pflicht=true nur wenn pflicht_wenn gesetzt und evaluates
  //    true.
  for (const slot of alleSlots) {
    if (slot.slot_id === 'kunde-nachreichung') continue // Sammelslot, nie initial
    if (existingSlots.has(slot.slot_id)) continue // schon angelegt
    if (!evaluateKatalogRule(slot.freigeschaltet_wenn, ctx)) continue
    const istPflicht = slot.pflicht_wenn != null && evaluateKatalogRule(slot.pflicht_wenn, ctx)
    docs.push({
      fall_id: fallId,
      dokument_typ: slot.slot_id,
      pflicht: istPflicht,
      status: 'ausstehend',
      quelle: 'system',
    })
    seen.add(slot.slot_id)
  }

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

  // AAR-623: Konditionale WA-Tasks fuer freigabe_bank + zeugenbericht
  // triggern — nur fuer Slots die gerade frisch als pflicht angelegt
  // wurden. Idempotent (prueft Task-Dedup + Upload-Status intern).
  try {
    const { triggerKonditionaleDokumentTasks } = await import('./konditional-tasks')
    const insertedSlots = docs.map((d) => d.dokument_typ)
    await triggerKonditionaleDokumentTasks(supabase, fallId, insertedSlots)
  } catch (err) {
    console.error('[AAR-623] triggerKonditionaleDokumentTasks failed:', err)
  }
}
