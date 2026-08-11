// AAR-623: Konditionale WhatsApp-Tasks fuer Dokumente die der Kunde aktiv
// einholen muss (Freigabe Bank bei Leasing/Finanzierung, Zeugenbericht bei
// zeugen_vorhanden=true). Triggert beim Anlegen/Freischalten des Slots eine
// WhatsApp-Nachricht an den Kunden mit Upload-Link.
//
// Idempotent: nutzt tasks.task_code als Dedup-Schluessel. Skip wenn
// Dokument bereits hochgeladen wurde.

import type { SupabaseClient } from '@supabase/supabase-js'
import { enqueue, buildDedupKey } from '@/lib/notifications/outbox'

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
    // CMM-49 Display-Sweep: kunde_id via Bridge+claims (faelle-frei). kunde_id==claims.geschaedigter_user_id (divergence=0).
    const { data: bridgeRow } = await supabase
      .from('faelle_claim_bridge')
      .select('claims:claims!fk_bridge_claim!inner(geschaedigter_user_id)')
      .eq('fall_id', fallId)
      .single()
    const claimEmbed = Array.isArray(bridgeRow?.claims) ? bridgeRow?.claims[0] : bridgeRow?.claims
    const fall = { kunde_id: (claimEmbed?.geschaedigter_user_id ?? null) as string | null }

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
    // C3a: durable via Notification-Outbox. dedupKey mit slotId als Fenster — diese
    // Schleife laeuft pro offenem Dokument-Slot, ein Key ohne slotId wuerde bei
    // mehreren fehlenden Dokumenten nur das erste anfordern. Kollidiert NICHT mit
    // dem sv-termin-dokument-reminder-Cron (gleiches Template, aber dort ist das
    // Fenster die termin.id).
    await enqueue({
      dedupKey: buildDedupKey({ template: 'dokumente_nachreichen', claimId: fallId, fenster: slotId }),
      kanal: 'whatsapp',
      template: 'dokumente_nachreichen',
      claimId: fallId,
      payload: { slot_id: slotId, slot_label: meta.label, grund: meta.grund },
    })

    result.triggered.push(slotId)
  }

  return result
}
