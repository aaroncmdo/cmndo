import { createAdminClient } from '@/lib/supabase/admin'

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
 */
export async function createAutoTask(params: AutoTaskParams) {
  const supabase = createAdminClient()

  const { error } = await supabase.from('tasks').insert({
    fall_id: params.fall_id,
    typ: params.task_typ,
    titel: params.titel,
    beschreibung: params.beschreibung,
    status: 'offen',
    zugewiesen_an: params.empfaenger_id,
    empfaenger_rolle: params.empfaenger_rolle,
    empfaenger_user_id: params.empfaenger_id,
    faellig_am: params.deadline.toISOString(),
    auto_erstellt: true,
    prioritaet: params.prioritaet ?? 'normal',
    phase: params.phase ?? null,
    task_code: params.task_code ?? null,
  })

  if (error) {
    console.error(`[tasking] Failed to create auto-task: ${error.message}`)
    return
  }

  await supabase.from('timeline').insert({
    fall_id: params.fall_id,
    typ: 'system',
    titel: `Auto-Task: ${params.titel}`,
    beschreibung: `Zugewiesen an ${params.empfaenger_rolle}. Deadline: ${params.deadline.toLocaleDateString('de-DE')}.`,
  })
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
    titel: 'QC-Pruefung durchfuehren (Filmcheck)',
    beschreibung: 'Gutachten eingegangen. Bitte QC-Pruefung innerhalb von 2h durchfuehren.',
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
    titel: 'Kanzlei-Paket uebergeben',
    beschreibung: 'QC bestanden. Bitte Kanzlei-Paket sofort uebergeben.',
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
    beschreibung: 'Kanzlei-Uebergabe erfolgt. Bitte Anschlussschreiben-Sendedatum HEUTE eintragen.',
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
  await createAutoTask({ fall_id: leadId, empfaenger_id: zugewiesenAn, empfaenger_rolle: 'leadbearbeiter', task_typ: 'lead-qualifizieren', titel: 'Lead qualifizieren', beschreibung: 'Neuer Lead eingegangen. Bitte innerhalb von 30 Min qualifizieren.', deadline: d30m, prioritaet: 'dringend', phase: 'lead', task_code: 'L-01' })
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
