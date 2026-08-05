// AAR-430: Sendet einen einzelnen Task-Reminder über die in `kanal` konfigurierten Channels.
// kanal-Token: "system", "whatsapp", "email" (zusammengesetzt per "+").
import { createAdminClient } from '@/lib/supabase/admin'
import { createMitteilungMulti } from '@/lib/mitteilungen/create-mitteilung'

type ReminderRow = {
  id: string
  task_id: string
  reminder_typ: string
  geplant_fuer: string
  empfaenger_rolle: string | null
  kanal: string
  status: string
  versuche: number
}

type TaskRow = {
  id: string
  fall_id: string | null
  titel: string | null
  beschreibung: string | null
  status: string | null
  prioritaet: string | null
  faellig_am: string | null
  zugewiesen_an: string | null
  empfaenger_user_id: string | null
  empfaenger_rolle: string | null
}

type ProfileRow = {
  id: string
  vorname: string | null
  nachname: string | null
  email: string | null
  telefon: string | null
}

function prioLabel(prio: string | null | undefined): string {
  if (prio === 'kritisch') return ' [KRITISCH]'
  if (prio === 'dringend') return ' [DRINGEND]'
  return ''
}

function buildMessage(typ: string, task: TaskRow): string {
  const label = prioLabel(task.prioritaet)
  const titel = task.titel ?? 'Task'
  if (typ.startsWith('pre_')) {
    return `Erinnerung${label}: "${titel}" ist in Kürze fällig. Bitte zeitnah erledigen.`
  }
  if (typ.startsWith('overdue_')) {
    return `Überfällig${label}: "${titel}" hat die Deadline überschritten. Bitte sofort bearbeiten.`
  }
  return `Erinnerung${label}: "${titel}".`
}

// Kanal-Handler liefern `true` wenn tatsaechlich zugestellt wurde, `false` bei einem
// Soft-Skip (Empfaenger hat fuer diesen Kanal keinen Kontakt / Task hat keinen fall_id).
// Ein echter Send-Fehler (Kanal sollte zustellen, warf aber) wird geworfen.
async function sendSystemMessage(fallId: string | null, message: string): Promise<boolean> {
  if (!fallId) return false
  const db = createAdminClient()
  const { error } = await db.from('nachrichten').insert({
    fall_id: fallId,
    kanal: 'system',
    sender_id: null,
    sender_rolle: 'system',
    nachricht: message,
    hat_anhang: false,
  })
  if (error) throw new Error(`nachrichten-insert: ${error.message}`)
  return true
}

async function sendWhatsAppForTask(profile: ProfileRow | null, message: string): Promise<boolean> {
  // Kein Telefon = Kanal fuer diesen Empfaenger nicht zustellbar (Soft-Skip, KEIN harter Fehler).
  // Interne Task-Empfaenger (Mitarbeiter) haben oft keine WhatsApp-Nummer -> system/email traegt.
  if (!profile?.telefon) return false
  const { sendWhatsApp } = await import('@/lib/whatsapp')
  const result = await sendWhatsApp(profile.telefon, message)
  if (!result.success) {
    throw new Error(result.error ?? 'WhatsApp-Send fehlgeschlagen')
  }
  return true
}

async function sendEmailForTask(
  profile: ProfileRow | null,
  task: TaskRow,
  message: string,
): Promise<boolean> {
  if (!profile?.email) return false // Soft-Skip: Empfaenger ohne Email -> Kanal nicht zustellbar.
  const { sendEmail } = await import('@/lib/email/google/client')
  const subject = `Task-Erinnerung: ${task.titel ?? 'Task'}`
  const html = `<p>${message.replace(/\n/g, '<br/>')}</p>${
    task.beschreibung ? `<p style="color:#555">${task.beschreibung}</p>` : ''
  }`
  await sendEmail({
    to: profile.email,
    subject,
    html,
    template: 'task_reminder_aar430',
    empfaengerTyp: 'admin',
    fallId: task.fall_id ?? null,
  })
  return true
}

export async function sendTaskReminder(reminderId: string): Promise<void> {
  const db = createAdminClient()

  const { data: reminder } = await db
    .from('task_reminders')
    .select('id, task_id, reminder_typ, geplant_fuer, empfaenger_rolle, kanal, status, versuche')
    .eq('id', reminderId)
    .maybeSingle<ReminderRow>()
  if (!reminder || reminder.status !== 'pending') return

  const { data: task } = await db
    .from('tasks')
    .select('id, fall_id, titel, beschreibung, status, prioritaet, faellig_am, zugewiesen_an, empfaenger_user_id, empfaenger_rolle')
    .eq('id', reminder.task_id)
    .maybeSingle<TaskRow>()

  // Task erledigt/cancelled/blockiert → Reminder canceln
  if (!task || ['erledigt', 'canceled', 'blockiert'].includes(task.status ?? '')) {
    await db.from('task_reminders').update({ status: 'cancelled' }).eq('id', reminder.id)
    return
  }

  // Empfänger-Profil laden
  const empfaengerId = task.zugewiesen_an ?? task.empfaenger_user_id
  let profile: ProfileRow | null = null
  if (empfaengerId) {
    const { data: p } = await db
      .from('profiles')
      .select('id, vorname, nachname, email, telefon')
      .eq('id', empfaengerId)
      .maybeSingle<ProfileRow>()
    profile = p ?? null
  }

  const message = buildMessage(reminder.reminder_typ, task)
  const channels = reminder.kanal.split('+').map(c => c.trim()).filter(Boolean)

  const errors: string[] = [] // harte Fehler (Kanal sollte zustellen, warf aber)
  const skipped: string[] = [] // Soft-Skips (kein Kontakt / kein fall_id) -> kein Fehler
  let delivered = 0 // Anzahl tatsaechlich zugestellter Kanaele
  for (const channel of channels) {
    try {
      let ok = false
      if (channel === 'system') {
        ok = await sendSystemMessage(task.fall_id, message)
      } else if (channel === 'whatsapp') {
        ok = await sendWhatsAppForTask(profile, message)
      } else if (channel === 'email') {
        ok = await sendEmailForTask(profile, task, message)
      } else {
        errors.push(`Unbekannter Kanal: ${channel}`)
        continue
      }
      if (ok) delivered++
      else skipped.push(channel)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      errors.push(`${channel}: ${msg}`)
    }
  }

  const notes = [...skipped.map(c => `${c}: uebersprungen (kein Kontakt)`), ...errors]

  // Last-Resort-Email-Fallback: kam KEIN konfigurierter Kanal durch (z.B. fall-loser Task ->
  // system nicht zustellbar + Mitarbeiter ohne WhatsApp-Nummer), der Empfaenger hat aber eine
  // Email -> per Email zustellen. Eine interne Task-Erinnerung soll den Bearbeiter erreichen,
  // statt still als failed zu verpuffen. Greift nur als letzter Ausweg (delivered === 0) und
  // nur wenn Email nicht ohnehin schon konfigurierter Kanal war (sonst wurde sie oben versucht).
  if (delivered === 0 && !channels.includes('email') && profile?.email) {
    try {
      if (await sendEmailForTask(profile, task, message)) {
        delivered++
        notes.push('email-fallback: zugestellt')
      }
    } catch (err) {
      notes.push(`email-fallback: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  // Zustell-Semantik: solange MINDESTENS EIN Kanal zugestellt hat, gilt der Reminder als
  // versendet. `failed` NUR wenn KEIN Kanal durchkam (alte Logik: ein WA-no-phone -> ganzer
  // Reminder failed, obwohl system/email zustellten). Soft-Skips + harte Fehler -> `fehler`.
  const note = notes.join(' | ') || null

  if (delivered > 0) {
    await db
      .from('task_reminders')
      .update({ status: 'sent', versendet_am: new Date().toISOString(), fehler: note })
      .eq('id', reminder.id)
  } else {
    await db
      .from('task_reminders')
      .update({
        status: 'failed',
        versuche: (reminder.versuche ?? 0) + 1,
        fehler: note ?? 'Kein zustellbarer Kanal',
      })
      .eq('id', reminder.id)
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// kunde-termin-funnel T3 (Task 11): 24h-SLA-Eskalation fuer die Terminwunsch-Queue
// (gutachter_termine status in dispatch_pending/sv_gesucht, laenger als 24h offen).
//
// KEIN task_reminders-Eintrag: dessen Dedup-Idiom ist ein Upsert auf dem UNIQUE-Key
// (task_id, reminder_typ) (reminder-generator.ts) — Terminwuensche sind KEINE
// tasks-Zeilen, ein tasks/task_reminders-Datensatz dafuer waere ein Fremdkoerper im
// Tasking-Domainmodell (1 Task = 1 Entitaet, hier aber eine AGGREGATION ueber N
// Terminwuensche). Ein neues Dedup-Feld auf gutachter_termine waere eine Schema-
// Aenderung (Regel 2 / AGENTS.md) — außerhalb des Scopes dieses Tasks.
//
// Dedup daher ueber ein bestehendes Log/Marker: die `mitteilungen`-Tabelle selbst
// (fixer Titel-Praefix + created_at) — KEIN neues Schema. Aggregiert: GENAU EINE
// Mitteilung pro 24h-Eskalationsfenster fuer ALLE ueberfaelligen Terminwuensche
// zusammen (Spam-Guard, NICHT eine pro Termin) — respawnt nicht bei jedem
// stuendlichen Cron-Lauf (`15 * * * * cron-call.sh /api/cron/task-erinnerungen`,
// docs/vps-crontab.md), sondern hoechstens einmal pro 24h (analog zum
// sustainedCrit-Re-Alert-Rhythmus in lib/health/persist-and-alert.ts).
//
// Empfaenger: ALLE Dispatch-User (Broadcast via createMitteilungMulti) — anders als
// die Eingangs-Notification (buche-deadpin-termin.ts, EIN Empfaenger pro Lead) ist
// eine SLA-Sammel-Eskalation nicht an einen einzelnen Lead/Dispatcher gebunden;
// Muster gespiegelt von public-rueckruf.ts/gutachter-finder-actions.ts ("Alle
// Dispatch-User laden" + createMitteilungMulti).
//
// Non-fatal: darf den Cron-Lauf (task-erinnerungen/route.ts) nie unterbrechen.
// ─────────────────────────────────────────────────────────────────────────────

const ESKALATION_TITEL_PREFIX = 'Terminwunsch wartet > 24 h'
const ESKALATION_FENSTER_MS = 24 * 60 * 60 * 1000

export async function eskaliereOffeneTerminwuensche(): Promise<void> {
  try {
    const db = createAdminClient()
    const cutoff = new Date(Date.now() - ESKALATION_FENSTER_MS).toISOString()

    const { data: offen, error } = await db
      .from('gutachter_termine')
      .select('id')
      .in('status', ['dispatch_pending', 'sv_gesucht'])
      .is('cancelled_at', null)
      .lt('created_at', cutoff)
    if (error) {
      console.error('[eskaliereOffeneTerminwuensche] Query gutachter_termine fehlgeschlagen:', error.message)
      return
    }
    const n = offen?.length ?? 0
    if (n === 0) return

    // Dedup: juengste Eskalations-Mitteilung dieses Musters — < 24h alt = bereits
    // eskaliert, kein Re-Fire (sonst wuerde jeder stuendliche Cron-Lauf spammen).
    const { data: letzte } = await db
      .from('mitteilungen')
      .select('created_at')
      .eq('route_url', '/dispatch/terminwuensche')
      .like('titel', `${ESKALATION_TITEL_PREFIX}%`)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (letzte?.created_at && Date.now() - new Date(letzte.created_at as string).getTime() < ESKALATION_FENSTER_MS) {
      return
    }

    const { data: dispatchUser } = await db.from('profiles').select('id').eq('rolle', 'dispatch')
    const empfaenger = (dispatchUser ?? []).map((u) => ({ id: u.id as string, rolle: 'dispatch' as const }))
    if (empfaenger.length === 0) return

    await createMitteilungMulti(empfaenger, {
      kategorie: 'update',
      prioritaet: 'dringend',
      titel: `${ESKALATION_TITEL_PREFIX} (${n} offen)`,
      route_url: '/dispatch/terminwuensche',
    })
  } catch (err) {
    console.error(
      '[eskaliereOffeneTerminwuensche] fehlgeschlagen (non-fatal):',
      err instanceof Error ? err.message : err,
    )
  }
}
