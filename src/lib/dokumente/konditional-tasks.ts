// AAR-623: Konditionale WhatsApp-Tasks fuer Dokumente die der Kunde aktiv
// einholen muss (Freigabe Bank bei Leasing/Finanzierung, Zeugenbericht bei
// zeugen_vorhanden=true). Triggert beim Anlegen/Freischalten des Slots eine
// WhatsApp-Nachricht an den Kunden mit Upload-Link.
//
// Idempotent: nutzt tasks.task_code als Dedup-Schluessel. Skip wenn
// Dokument bereits hochgeladen wurde.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendFallCommunication } from '@/lib/communications/send-fall'

/** Slot-IDs fuer die der WA-Task greift. */
const KONDITIONAL_SLOT_IDS = new Set(['freigabe_bank', 'zeugenbericht'])

/** Label + Grund-Text fuer jeden Slot, wird in die WA-Nachricht gereicht. */
const SLOT_META: Record<string, { label: string; grund: string }> = {
  freigabe_bank: {
    label: 'Freigabe der Bank',
    grund:
      'Ihr Fahrzeug ist finanziert/geleast — wir brauchen die Freigabe der Bank zur Schadenregulierung',
  },
  zeugenbericht: {
    label: 'Zeugenbericht',
    grund:
      'Sie haben Zeugen angegeben — bitte senden Sie uns den schriftlichen Bericht der Zeugen',
  },
}

export type KonditionalTaskResult = {
  triggered: string[]
  skipped: Array<{ slot: string; reason: string }>
}

/**
 * Prueft fuer jeden angegebenen Slot ob ein WA-Task gesendet werden soll,
 * und erzeugt die Task + WA-Nachricht idempotent.
 */
export async function triggerKonditionaleDokumentTasks(
  supabase: SupabaseClient,
  fallId: string,
  slotIds: string[],
): Promise<KonditionalTaskResult> {
  const result: KonditionalTaskResult = { triggered: [], skipped: [] }
  const relevante = slotIds.filter((s) => KONDITIONAL_SLOT_IDS.has(s))
  if (relevante.length === 0) return result

  for (const slotId of relevante) {
    const taskCode = `konditionaldokument_${slotId}_${fallId}`

    // Idempotenz 1: Gibt es den Task schon?
    const { data: existingTask } = await supabase
      .from('tasks')
      .select('id')
      .eq('task_code', taskCode)
      .limit(1)
      .maybeSingle()
    if (existingTask) {
      result.skipped.push({ slot: slotId, reason: 'task_existiert' })
      continue
    }

    // Idempotenz 2: Ist das Dokument bereits hochgeladen?
    const { data: existingDoc } = await supabase
      .from('fall_dokumente')
      .select('id')
      .eq('fall_id', fallId)
      .eq('dokument_typ', slotId)
      .is('geloescht_am', null)
      .limit(1)
      .maybeSingle()
    if (existingDoc) {
      result.skipped.push({ slot: slotId, reason: 'dokument_hochgeladen' })
      continue
    }

    const meta = SLOT_META[slotId]

    // Task anlegen (Owner = Kunde via empfaenger_user_id aus faelle.kunde_id)
    const { data: fall } = await supabase
      .from('faelle')
      .select('kunde_id')
      .eq('id', fallId)
      .single()

    await supabase.from('tasks').insert({
      fall_id: fallId,
      typ: 'dokument-einholen',
      titel: `${meta.label} einholen und hochladen`,
      beschreibung: meta.grund,
      status: 'offen',
      prioritaet: 'normal',
      zugewiesen_an: fall?.kunde_id ?? null,
      empfaenger_rolle: 'kunde',
      empfaenger_user_id: fall?.kunde_id ?? null,
      auto_erstellt: true,
      entity_type: 'fall',
      entity_id: fallId,
      task_code: taskCode,
    })

    // WA-Nachricht an Kunde via bestehendes Template „dokumente_nachreichen"
    // mit slot-spezifischem Grund-Text in extraData.
    await sendFallCommunication(fallId, 'dokumente_nachreichen', {
      slot_id: slotId,
      slot_label: meta.label,
      grund: meta.grund,
    })

    result.triggered.push(slotId)
  }

  return result
}
