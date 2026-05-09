import { createAdminClient } from '@/lib/supabase/admin'
import { generateReminderForTask, cancelRemindersForTask } from '@/lib/tasks/reminder-generator'
import { findFirstActiveAdmin } from '@/lib/faelle/kb-assignment'

type AutoTaskParams = {
  fall_id: string
  empfaenger_id: string | null
  empfaenger_rolle: string
  task_typ: string
  titel: string
  beschreibung: string
  deadline: Date
  prioritaet?: 'normal' | 'dringend' | 'kritisch'
  phase?: string
  task_code?: string
}

/**
 * Zentrale Funktion zum Erstellen automatischer Tasks.
 * Erstellt einen Task in der tasks-Tabelle und einen Timeline-Eintrag.
 * AAR-430: Gibt die neue Task-ID zurück und generiert Reminder-Kaskade.
 */
export async function createAutoTask(params: AutoTaskParams): Promise<{ id: string } | null> {
  const supabase = createAdminClient()

  // AAR-632: Orphaned-Task-Fix. Wenn kein empfaenger_id angegeben ist, fällt
  // der Task sonst auf zugewiesen_an=null. Beim nächsten resolveTasksForEntity
  // (z.B. Fall abgeschlossen) würde er stumm auto-closed — obwohl er evtl.
  // nie bearbeitet wurde. Fallback: erster aktiver Admin übernimmt, der
  // kann via Task-Liste selbst umverteilen.
  let empfaengerId = params.empfaenger_id
  let fallbackReason: string | null = null
  if (!empfaengerId) {
    const admin = await findFirstActiveAdmin(supabase)
    if (admin?.id) {
      empfaengerId = admin.id
      fallbackReason = `AAR-632 Admin-Fallback (kein ${params.empfaenger_rolle} zugewiesen)`
      console.warn(`[AAR-632] Task ohne empfaenger_id → Admin-Fallback`, {
        task_typ: params.task_typ,
        fall_id: params.fall_id,
        admin_id: admin.id,
        admin_email: admin.email,
      })
    } else {
      console.error(`[AAR-632] Task ohne empfaenger_id + kein aktiver Admin — Task bleibt unassigned`, {
        task_typ: params.task_typ,
        fall_id: params.fall_id,
      })
    }
  }

  // Dedup: wenn task_code gesetzt, keinen zweiten offenen Task desselben Typs erzeugen
  if (params.task_code) {
    const { data: existing } = await supabase
      .from('tasks')
      .select('id')
      .eq('fall_id', params.fall_id)
      .eq('task_code', params.task_code)
      .in('status', ['offen', 'in-bearbeitung'])
      .limit(1)
      .maybeSingle()
    if (existing) {
      console.info(`[tasking] Dedup: Task ${params.task_code} für Fall ${params.fall_id} bereits offen — übersprungen`)
      return existing
    }
  }

  const { data, error } = await supabase.from('tasks').insert({
    fall_id: params.fall_id,
    typ: params.task_typ,
    titel: params.titel,
    beschreibung: fallbackReason
      ? `${params.beschreibung}\n\n[${fallbackReason}]`
      : params.beschreibung,
    status: 'offen',
    zugewiesen_an: empfaengerId,
    empfaenger_rolle: params.empfaenger_rolle,
    empfaenger_user_id: empfaengerId,
    faellig_am: params.deadline.toISOString(),
    auto_erstellt: true,
    prioritaet: params.prioritaet ?? 'normal',
    phase: params.phase ?? null,
    task_code: params.task_code ?? null,
    // KFZ-151: Implizite Entity-Verknuepfung damit der zentrale Resolver greift
    entity_type: 'fall',
    entity_id: params.fall_id,
  }).select('id').single()

  if (error || !data?.id) {
    console.error(`[tasking] Failed to create auto-task: ${error?.message ?? 'kein id zurück'}`)
    return null
  }

  await supabase.from('timeline').insert({
    fall_id: params.fall_id,
    typ: 'system',
    titel: `Auto-Task: ${params.titel}`,
    beschreibung: `Zugewiesen an ${params.empfaenger_rolle}. Deadline: ${params.deadline.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}.`,
  })

  // AAR-430: Reminder-Kaskade generieren
  try {
    await generateReminderForTask(data.id)
  } catch (err) {
    console.error('[AAR-430] generateReminderForTask fehlgeschlagen:', err)
  }

  return { id: data.id }
}

// ─── Phase: Konversion ───────────────────────────────────────────────────────

/** Nach Lead-Abschluss: Task fuer Kundenbetreuer + Kunde */
export async function triggerKonversionTasks(fallId: string, kundenbetreuerIds: string | null, kundeId: string | null) {
  const deadline24h = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const deadline48h = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'erster-kontakt',
    titel: 'Ersten Kontakt mit Kunde herstellen',
    beschreibung: 'Kunde wurde konvertiert. Bitte innerhalb von 24h Kontakt aufnehmen.',
    deadline: deadline24h,
    prioritaet: 'dringend',
  })

  if (kundeId) {
    await createAutoTask({
      fall_id: fallId,
      empfaenger_id: kundeId,
      empfaenger_rolle: 'kunde',
      task_typ: 'flowlink-durchlaufen',
      titel: 'FlowLink durchlaufen und Dokumente hochladen',
      beschreibung: 'Bitte durchlaufen Sie den FlowLink und laden Sie alle benoetigten Dokumente hoch.',
      deadline: deadline48h,
    })
  }
}

// ─── Phase: Onboarding ───────────────────────────────────────────────────────

/** Vor Gutachtertermin: Pflichtdokumente nachhalten */
export async function triggerOnboardingDokumenteTask(fallId: string, kundenbetreuerIds: string | null, terminDatum: Date) {
  const deadline = new Date(terminDatum.getTime() - 24 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'dokumente-nachhalten',
    titel: 'Fehlende Pflichtdokumente nachhalten',
    beschreibung: 'Gutachtertermin in Kuerze. Bitte fehlende Pflichtdokumente beim Kunden nachfragen.',
    deadline,
    prioritaet: 'dringend',
  })
}

// ─── Phase: Gutachter ────────────────────────────────────────────────────────

/** Nach SV-Zuweisung: Termin bestaetigen */
export async function triggerGutachterTerminTask(fallId: string, svId: string | null) {
  const deadline = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'termin-bestaetigen',
    titel: 'Termin bestaetigen oder Gegenvorschlag',
    beschreibung: 'Sie haben einen neuen Auftrag erhalten. Bitte bestaetigen Sie den Termin oder schlagen Sie einen Alternativtermin vor.',
    deadline,
    prioritaet: 'dringend',
  })
}

/** Nach Besichtigung: Gutachten hochladen */
export async function triggerGutachtenUploadTask(fallId: string, svId: string | null) {
  const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'gutachten-hochladen',
    titel: 'Gutachten hochladen nach Besichtigung',
    beschreibung: 'Besichtigung abgeschlossen. Bitte laden Sie das Gutachten innerhalb von 48h hoch.',
    deadline,
    prioritaet: 'dringend',
  })
}

// ─── Phase: QC ───────────────────────────────────────────────────────────────

/** Nach Gutachten-Upload: QC durchfuehren */
export async function triggerQcTask(fallId: string, kundenbetreuerIds: string | null) {
  const deadline = new Date(Date.now() + 2 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'qc-pruefung',
    titel: 'QC-Prüfung durchführen (Filmcheck)',
    beschreibung: 'Gutachten eingegangen. Bitte QC-Prüfung innerhalb von 2h durchführen.',
    deadline,
    prioritaet: 'dringend',
  })
}

/** Nach QC Bestanden: Kanzlei-Paket uebergeben */
export async function triggerKanzleiPaketTask(fallId: string, kundenbetreuerIds: string | null) {
  const deadline = new Date(Date.now() + 60 * 60 * 1000) // 1h

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'kanzlei-paket',
    titel: 'Kanzlei-Paket übergeben',
    beschreibung: 'QC bestanden. Bitte Kanzlei-Paket sofort übergeben.',
    deadline,
    prioritaet: 'dringend',
  })
}

// ─── Phase: Versicherung ─────────────────────────────────────────────────────

/** Nach Kanzlei-Uebergabe: AS-Sendedatum eintragen */
export async function triggerAsSendedatumTask(fallId: string, kundenbetreuerIds: string | null) {
  const deadline = new Date()
  deadline.setHours(23, 59, 0, 0)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'as-sendedatum',
    titel: 'AS-Sendedatum eintragen – KRITISCH',
    beschreibung: 'Kanzlei-Übergabe erfolgt. Bitte Anschlussschreiben-Sendedatum HEUTE eintragen.',
    deadline,
    prioritaet: 'kritisch',
  })
}

// ─── Phase: Abschluss ────────────────────────────────────────────────────────

/** Nach Zahlung: Fall archivieren */
export async function triggerArchivierungTask(fallId: string, kundenbetreuerIds: string | null) {
  const deadline = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)

  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: kundenbetreuerIds,
    empfaenger_rolle: 'kundenbetreuer',
    task_typ: 'fall-archivieren',
    titel: 'Fall archivieren nach Auszahlung',
    beschreibung: 'Zahlung ist eingegangen. Bitte Fall innerhalb von 5 Tagen archivieren und abschliessen.',
    deadline,
  })
}

// ─── Phase 1: Lead-Tasks ────────────────────────────────────────────────────

export async function triggerLeadTasks(leadId: string, zugewiesenAn: string | null) {
  const d30m = new Date(Date.now() + 30 * 60 * 1000)
  const d2h = new Date(Date.now() + 2 * 60 * 60 * 1000)

  // L-01 sofort
  await createAutoTask({ fall_id: leadId, empfaenger_id: zugewiesenAn, empfaenger_rolle: 'dispatch', task_typ: 'lead-qualifizieren', titel: 'Lead qualifizieren', beschreibung: 'Neuer Lead eingegangen. Bitte innerhalb von 30 Min qualifizieren.', deadline: d30m, prioritaet: 'dringend', phase: 'lead', task_code: 'L-01' })
  // L-04 parallel (KI-Schätzung)
  await createAutoTask({ fall_id: leadId, empfaenger_id: null, empfaenger_rolle: 'system', task_typ: 'ki-schaetzung', titel: 'KI-Schadenschaetzung durchfuehren', beschreibung: 'Automatische Schaetzung basierend auf Schadensbeschreibung.', deadline: d2h, phase: 'lead', task_code: 'L-04' })
}

// ─── Phase 3: Onboarding-Tasks ──────────────────────────────────────────────

export async function triggerOnboardingTasks(fallId: string, kbId: string | null, kundeId: string | null) {
  const d24h = new Date(Date.now() + 24 * 60 * 60 * 1000)
  const d48h = new Date(Date.now() + 48 * 60 * 60 * 1000)

  await createAutoTask({ fall_id: fallId, empfaenger_id: kundeId, empfaenger_rolle: 'kunde', task_typ: 'flowlink-durchlaufen', titel: 'FlowLink durchlaufen', beschreibung: 'Bitte alle Schritte ausfuellen und Dokumente hochladen.', deadline: d48h, phase: 'onboarding', task_code: 'O-01' })
  await createAutoTask({ fall_id: fallId, empfaenger_id: kbId, empfaenger_rolle: 'kundenbetreuer', task_typ: 'erster-kontakt-kb', titel: 'Erster Kontakt mit Kunde', beschreibung: 'Bitte innerhalb von 24h den Kunden kontaktieren.', deadline: d24h, prioritaet: 'dringend', phase: 'onboarding', task_code: 'O-05' })
  await createAutoTask({ fall_id: fallId, empfaenger_id: kbId, empfaenger_rolle: 'kundenbetreuer', task_typ: 'docs-nachhalten', titel: 'Fehlende Dokumente nachhalten', beschreibung: 'Laufend pruefen ob alle Pflichtdokumente vorhanden sind.', deadline: d48h, phase: 'onboarding', task_code: 'O-06' })
}

// ─── Gate-Logik ─────────────────────────────────────────────────────────────

// ─── Auto-Complete Tasks (KFZ-70) ───────────────────────────────────────────

const EVENT_TO_TASK: Record<string, string[]> = {
  'gutachter_termin_bestaetigt': ['G-01'],
  'status_besichtigung': ['G-05'],
  'gutachten_hochgeladen': ['G-07'],
  'qc_bestanden': ['Q-01'],
  'qc_fehlgeschlagen': ['Q-01'],
  'status_kanzlei_uebergeben': ['Q-03'],
  'as_sendedatum_gesetzt': ['V-01', 'V-02'],
  'flow_link_abgeschlossen': ['O-01'],
  'erster_kontakt': ['O-05'],
  'schadentyp_gesetzt': ['L-01'],
  'gutachter_termin_gesetzt': ['L-05'],
  'lead_konvertiert': ['L-06'],
}

export async function autoCompleteTask(fallId: string, eventType: string) {
  const taskCodes = EVENT_TO_TASK[eventType]
  if (!taskCodes?.length) return

  const supabase = createAdminClient()

  for (const code of taskCodes) {
    const { data: task } = await supabase
      .from('tasks')
      .select('id, titel')
      .eq('fall_id', fallId)
      .eq('task_code', code)
      .in('status', ['offen', 'in-bearbeitung', 'blockiert'])
      .limit(1)
      .maybeSingle()

    if (!task) continue

    await supabase.from('tasks').update({
      status: 'erledigt',
      erledigt_am: new Date().toISOString(),
    }).eq('id', task.id)

    // AAR-430: pending Reminder stornieren, da Task abgeschlossen
    try {
      await cancelRemindersForTask(task.id)
    } catch (err) {
      console.error('[AAR-430] cancelRemindersForTask fehlgeschlagen:', err)
    }

    await supabase.from('timeline').insert({
      fall_id: fallId,
      typ: 'system',
      titel: `Task automatisch erledigt: ${task.titel}`,
      beschreibung: `Ausgelöst durch: ${eventType}`,
    })

    // Resolve gates for downstream tasks
    await resolveGates(task.id)
  }
}

/** Nach Task-Erledigen: Blockierte Folge-Tasks freischalten */
export async function resolveGates(taskId: string) {
  const supabase = createAdminClient()

  // Find tasks that are blocked by this task
  const { data: blocked } = await supabase
    .from('tasks')
    .select('id, titel')
    .eq('gate_task_id', taskId)
    .eq('status', 'blockiert')

  if (!blocked?.length) return

  for (const t of blocked) {
    await supabase.from('tasks').update({ status: 'offen' }).eq('id', t.id)
  }
}
