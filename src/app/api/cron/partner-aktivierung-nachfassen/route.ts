// Partner-Aktivierungs-Nachfassen: aus dem Monitoring-Befund wird eine nachverfolgbare
// Vertriebs-Aufgabe. Fuer jeden Partner-Account, der >7 Tage alt ist und sich NIE
// eingeloggt hat, entsteht EIN Admin-Task "anrufen" — dedupliziert und selbstheilend.
//
// Warum keine weitere Nudge-Mail: die Willkommens-Mail ging nachweislich raus
// (email_log status=sent, bei mehreren Werkstaetten sogar re-sent) und hat nicht
// konvertiert. Entscheidung Aaron 19.07.: sofort ein Mensch statt noch einer Mail.
//
// Erkennung liegt im geteilten Detektor (src/lib/partner/stuck-accounts.ts) — derselbe,
// den der Health-Check stuck-partner-accounts nutzt. Der Check beobachtet, dieser Cron handelt.
//
// Schedule (VPS-crontab, NICHT vercel.json — das existiert in diesem Repo nicht):
//   0 7 * * *  /usr/local/bin/cron-call.sh /api/cron/partner-aktivierung-nachfassen
// GESETZT 20.07. auf 212.132.119.110 (Backup der Vorversion: /root/crontab-backup-20260720-153302.txt).
// ACHTUNG Zeitzone: der VPS laeuft auf Etc/UTC — 07:00 UTC = 09:00 MESZ. Das gilt fuer die
// GESAMTE crontab, nicht nur hier; der Task erscheint also zum Arbeitsbeginn, nicht um 7.
// Bis zum Deploy liefert die Route 404; cron-call.sh nutzt `curl -sf` -> Exit 22, keine
// Ausgabe, keine Cron-Mail (am 20.07. gegen prod verifiziert). Gleiche Uhrzeit + gleiches
// Muster wie der Schwester-Cron gegner-invite-nachfassen.
import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { findStuckPartnerAccounts } from '@/lib/partner/stuck-accounts'

export const dynamic = 'force-dynamic'

/** Ein Detektor-Fehler darf nicht hunderte Vertriebs-Tasks fluten. Ueberhang wird gemeldet. */
const MAX_TASKS_PRO_LAUF = 25
const CODE_PREFIX = 'partner-aktivierung:'

export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createAdminClient()

  const res = await findStuckPartnerAccounts(admin)
  if (!res.ok) {
    console.error('[cron/partner-aktivierung-nachfassen] Detektor fehlgeschlagen:', res.error)
    return NextResponse.json({ error: res.error }, { status: 500 })
  }
  const stuck = res.partner

  // ── A) Tasks erzeugen (dedupliziert, gedeckelt) ─────────────────────────────
  let tasksErstellt = 0
  let uebersprungenCap = 0

  for (const p of stuck) {
    if (tasksErstellt >= MAX_TASKS_PRO_LAUF) {
      uebersprungenCap++
      continue
    }
    try {
      const code = `${CODE_PREFIX}${p.userId}`
      // Dedupe ueber ALLE Status (auch 'erledigt'): ein Partner bekommt genau EINEN
      // Anruf-Task, jemals. Sonst Nag-Loop — der Vertrieb schliesst den Task, der
      // Partner ist immer noch tot, und der naechste Lauf legt sofort neu an.
      const { data: vorhanden } = await admin.from('tasks').select('id').eq('task_code', code).limit(1)
      if (vorhanden && vorhanden.length > 0) continue

      const kontakt = [p.telefon ? `Telefon: ${p.telefon}` : null, `E-Mail: ${p.email}`]
        .filter(Boolean)
        .join(' · ')

      await createLinkedTask({
        titel: `Partner aktivieren: ${p.name ?? p.email} (${p.rolle})`,
        beschreibung:
          `${kontakt}\n\n` +
          `Angelegt am ${p.seit.slice(0, 10)}, hat sich seitdem NIE eingeloggt. ` +
          `Die Zugangs-/Willkommens-Mail wurde bereits versendet und hat nicht ` +
          `konvertiert — bitte telefonisch nachfassen und die Aktivierung begleiten.`,
        prioritaet: 'normal',
        empfaenger_rolle: 'admin',
        typ: 'partner_aktivierung',
        task_code: code,
        trigger_event: 'partner_ohne_erstlogin',
        // KEIN entity_type/entity_id: der tasks_entity_type-CHECK kennt kein 'partner'
        // -> Postgres wuerde die Zeile still verwerfen.
      })
      tasksErstellt++
    } catch (err) {
      // Fehler pro Item -> weiter, nie throw (Cron-Hausmuster, s. gegner-invite-nachfassen)
      console.error('[cron/partner-aktivierung-nachfassen] Partner', p.userId, 'fehlgeschlagen:', err)
      continue
    }
  }

  if (uebersprungenCap > 0) {
    console.warn(
      `[cron/partner-aktivierung-nachfassen] Cap ${MAX_TASKS_PRO_LAUF} erreicht — ${uebersprungenCap} Partner uebersprungen`,
    )
  }

  // ── B) Selbstheilung: Tasks schliessen, deren Partner sich eingeloggt hat ────
  // Der generische autoCompleteTask-Resolver greift hier nicht (er arbeitet ueber
  // entity_type/entity_id, die wir mangels 'partner'-CHECK-Wert nicht setzen koennen).
  let tasksGeschlossen = 0
  const { data: offene } = await admin
    .from('tasks')
    .select('id, task_code')
    .like('task_code', `${CODE_PREFIX}%`)
    .eq('status', 'offen')
    .limit(500)

  for (const t of (offene ?? []) as Array<{ id: string; task_code: string }>) {
    try {
      const userId = t.task_code.slice(CODE_PREFIX.length)
      const { data: udata, error: uErr } = await admin.auth.admin.getUserById(userId)
      if (uErr || !udata?.user?.last_sign_in_at) continue
      const { error: schliessFehler } = await admin.from('tasks').update({ status: 'erledigt' }).eq('id', t.id)
      if (schliessFehler) {
        console.error(`[cron/partner-aktivierung-nachfassen] Task ${t.id} nicht geschlossen:`, schliessFehler.message)
      }
      tasksGeschlossen++
    } catch (err) {
      console.error('[cron/partner-aktivierung-nachfassen] Task', t.id, 'schliessen fehlgeschlagen:', err)
      continue
    }
  }

  return NextResponse.json({
    geprueft: stuck.length,
    tasks_erstellt: tasksErstellt,
    tasks_geschlossen: tasksGeschlossen,
    uebersprungen_cap: uebersprungenCap,
  })
}
