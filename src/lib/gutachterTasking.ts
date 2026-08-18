import { createAdminClient } from '@/lib/supabase/admin'
import { createAutoTask, resolveGates } from '@/lib/tasking'
import { createNotification } from '@/lib/notifications'
import { cancelRemindersForTask } from '@/lib/tasks/reminder-generator'

/**
 * SV-01: Neuer Auftrag — wird getriggert wenn Admin sv_id setzt
 */
export async function triggerSV01(fallId: string, svUserId: string, kundeName: string, adresse: string, kennzeichen: string, schadentyp: string, wunschtermin: string | null) {
  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svUserId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'sv-termin-bestaetigen',
    titel: 'Neuer Auftrag — Termin bestätigen',
    beschreibung: `Kunde: ${kundeName}, Adresse: ${adresse}, Kennzeichen: ${kennzeichen ?? '—'}, Schadentyp: ${schadentyp ?? '—'}${wunschtermin ? `, Wunschtermin: ${new Date(wunschtermin).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin' })}` : ''}. Bitte bestätigen oder Gegenvorschlag machen.`,
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    prioritaet: 'dringend',
    phase: 'gutachter',
    task_code: 'SV-01',
  })
  createNotification(svUserId, 'neuer-fall', `Neuer Auftrag: ${kundeName}`, `${adresse} · ${kennzeichen ?? ''}`, `/gutachter/fall/${fallId}`).catch(() => {})
}

/**
 * SV-02: Zum Termin fahren — nach Terminbestätigung
 */
export async function triggerSV02(fallId: string, svUserId: string, terminDatum: Date) {
  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svUserId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'sv-zum-termin',
    titel: 'Zum Termin fahren',
    beschreibung: `Termin bestätigt. Bitte pünktlich vor Ort sein.`,
    deadline: terminDatum,
    phase: 'gutachter',
    task_code: 'SV-02',
  })
}

/**
 * SV-03: Vor-Ort Dokumentation — nach Ankunft
 */
export async function triggerSV03(fallId: string, svUserId: string) {
  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svUserId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'sv-vor-ort',
    titel: 'Vor-Ort Dokumentation',
    beschreibung: 'Fotos aufnehmen, FIN prüfen, Kilometerstand erfassen, fehlende Dokumente einsammeln.',
    deadline: new Date(),
    prioritaet: 'dringend',
    phase: 'gutachter',
    task_code: 'SV-03',
  })
}

/**
 * SV-04: Gutachten hochladen — nach Besichtigung
 */
export async function triggerSV04(fallId: string, svUserId: string) {
  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svUserId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'sv-gutachten-upload',
    titel: 'Gutachten erstellen und hochladen',
    beschreibung: 'Bitte Gutachten innerhalb von 48h als PDF hochladen.',
    deadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    prioritaet: 'dringend',
    phase: 'gutachter',
    task_code: 'SV-04',
  })
}

/**
 * SV-05: Nachbesserung — nach QC-Ablehnung
 */
export async function triggerSV05(fallId: string, svUserId: string, kommentare: string) {
  await createAutoTask({
    fall_id: fallId,
    empfaenger_id: svUserId,
    empfaenger_rolle: 'gutachter',
    task_typ: 'sv-nachbesserung',
    titel: 'Gutachten nachbessern — QC abgelehnt',
    beschreibung: `QC-Kommentare: ${kommentare}`,
    deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
    prioritaet: 'kritisch',
    phase: 'gutachter',
    task_code: 'SV-05',
  })
  createNotification(svUserId, 'qc-fehlgeschlagen', 'Gutachten: Nachbesserung nötig', kommentare, `/gutachter/fall/${fallId}`).catch(() => {})
}

/**
 * Auto-complete SV tasks + create next
 */
export async function completeSVTask(fallId: string, taskCode: string) {
  const db = createAdminClient()
  const { data: task } = await db.from('tasks').select('id').eq('fall_id', fallId).eq('task_code', taskCode).in('status', ['offen', 'in-bearbeitung']).limit(1).maybeSingle()
  if (task) {
    // Bleibt die Aufgabe offen, sieht der Gutachter sie weiter in seiner Liste,
    // obwohl der Schritt erledigt ist.
    const { error: erledigtFehler } = await db.from('tasks').update({ status: 'erledigt', erledigt_am: new Date().toISOString() }).eq('id', task.id)
    if (erledigtFehler) {
      console.error(`[gutachterTasking] Task ${task.id} nicht auf erledigt gesetzt:`, erledigtFehler.message)
    }
    // AAR-430: pending Reminder stornieren
    try {
      await cancelRemindersForTask(task.id)
    } catch (err) {
      console.error('[AAR-430] cancelRemindersForTask (completeSVTask) fehlgeschlagen:', err)
    }
    await resolveGates(task.id)
  }
}

// Leadpreis-Billing entfernt (Konsolidierung 2026-07-01): calculateLeadpreis
// (hardcoded 150/200/250/300), deductLeadpreis (@SV-Zuweisung) und refundLeadpreis
// (@Storno, gutachter_abrechnungen-Ledger) sind weg. Der SV-Leadpreis laeuft jetzt
// ausschliesslich ueber processCaseBilling (State-Machine @ gutachten-eingegangen,
// AAR-924) + revertCaseBilling (@Storno, AAR-926) — beide claims-SSoT, MIN(150).
