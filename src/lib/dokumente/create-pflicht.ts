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

  // AAR-956 Katalog-Domaenengrenze: `gutachter_verifizierung`-Slots sind SV-Onboarding-
  // Dokumente (uploadbar_von=[sachverstaendiger], eigener sv_id-gekeyter Anlagepfad in
  // sv-verifizierung-actions.ts) und gehoeren NICHT auf einen Claim/Fall. Vier davon
  // (sv_sicherungsabtretung/-berufshaftpflicht/-gewerbeanmeldung/-abtretungserklaerung)
  // tragen pflicht_wenn={} ("leeres Objekt = immer wahr", ruleEvaluator) und rutschen
  // damit am `pflicht_wenn == null`-Filter vorbei -> wurden als perpetuell-ausstehende
  // Karteileichen auf JEDEN Claim geschrieben (nie kunde-/claim-uploadbar; auf
  // reparatur-Wegen ohne SV nie erfuellbar). Claim-Doku-Konsumenten filtern die
  // Kategorie ohnehin raus (gutachter/feldmodus/_fallakte/actions.ts) — hier an der
  // QUELLE schliessen. `{}` bleibt korrekt fuer die SV-Domaene (dort immer Pflicht).
  const claimPflichtSlots = pflichtSlots.filter(
    (slot) => slot.kategorie !== 'gutachter_verifizierung',
  )

  const docs: PflichtdokumenteInsert[] = []
  const seen = new Set<string>()

  for (const slot of claimPflichtSlots) {
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

  if (docs.length === 0) {
    // Beobachtbarkeit: docs.length===0 heisst normalerweise "alle Slots existieren schon"
    // (idempotenter Re-Run). Wenn der Katalog aber GAR KEINE Pflicht-Slots liefert
    // (pflichtSlots leer), ist das fuer einen realen Claim ungewoehnlich und eine moegliche
    // Ursache des "Claim ohne Pflichtdokument-Slots"-Health-Funds (evtl. unvollstaendiger
    // Lead-/Fall-Kontext). Loggen, damit der stille Fall diagnostizierbar ist.
    if (claimPflichtSlots.length === 0) {
      console.warn(
        `[create-pflicht] Katalog lieferte 0 Claim-Pflicht-Slots fuer fall ${fallId} — kein Slot angelegt (Lead-/Fall-Kontext evtl. unvollstaendig).`,
      )
    }
    return
  }

  const { error: insertError } = await supabase.from('pflichtdokumente').insert(docs)
  if (insertError) {
    // Stiller Slot-Init-Fehler = genau die Ursache des "Claim ohne Pflichtdokument-Slots"-
    // Health-Funds. NICHT werfen (wuerde die Lead-Konvertierung / den Erstell-Pfad brechen),
    // aber sichtbar loggen statt still verpuffen zu lassen.
    console.error(
      `[create-pflicht] pflichtdokumente-insert fehlgeschlagen fuer fall ${fallId} ` +
        `(${docs.length} Slots: ${docs.map((d) => d.dokument_typ).join(', ')}): ${insertError.message}`,
    )
    return
  }

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
