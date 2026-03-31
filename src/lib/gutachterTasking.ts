import { createAdminClient } from '@/lib/supabase/admin'
import { createAutoTask, resolveGates } from '@/lib/tasking'
import { sendStatusWhatsApp } from '@/lib/whatsapp'
import { createNotification } from '@/lib/notifications'

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
    beschreibung: `Kunde: ${kundeName}, Adresse: ${adresse}, Kennzeichen: ${kennzeichen ?? '—'}, Schadentyp: ${schadentyp ?? '—'}${wunschtermin ? `, Wunschtermin: ${new Date(wunschtermin).toLocaleDateString('de-DE')}` : ''}. Bitte bestätigen oder Gegenvorschlag machen.`,
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
  const { data: task } = await db.from('tasks').select('id').eq('fall_id', fallId).eq('task_code', taskCode).in('status', ['offen', 'in-arbeit']).limit(1).maybeSingle()
  if (task) {
    await db.from('tasks').update({ status: 'erledigt', erledigt_am: new Date().toISOString() }).eq('id', task.id)
    await resolveGates(task.id)
  }
}

/**
 * Calculate Leadpreis based on Schadenshöhe
 */
export function calculateLeadpreis(schadenhoehe: number): number {
  if (schadenhoehe <= 2000) return 150
  if (schadenhoehe <= 5000) return 200
  if (schadenhoehe <= 10000) return 250
  return 300
}

/**
 * Deduct Leadpreis from Gutachter Guthaben
 */
export async function deductLeadpreis(svId: string, fallId: string, schadenhoehe: number, fallNummer: string) {
  const db = createAdminClient()
  const leadpreis = calculateLeadpreis(schadenhoehe)

  await db.rpc('decrement_guthaben', { sv_id_param: svId, amount: leadpreis }).catch(async () => {
    // Fallback if RPC doesn't exist
    const { data: sv } = await db.from('sachverstaendige').select('guthaben').eq('id', svId).single()
    const current = Number(sv?.guthaben ?? 0)
    await db.from('sachverstaendige').update({ guthaben: current - leadpreis }).eq('id', svId)
  })

  await db.from('gutachter_abrechnungen').insert({
    sv_id: svId,
    fall_id: fallId,
    typ: 'leadpreis',
    betrag: -leadpreis,
    beschreibung: `Leadpreis Fall ${fallNummer} (Schaden: ${schadenhoehe}€)`,
  }).catch(() => {}) // Table might not exist yet
}
