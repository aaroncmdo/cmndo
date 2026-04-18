import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { AlertTriangleIcon, CheckCircle2Icon, ArrowRightIcon } from 'lucide-react'

// KFZ-155: Kritische Updates Widget — rote Box mit allem was Aaron sofort
// braucht. Wenn keine Alerts: gruene 'Alles ruhig' Box.
//
// Quellen:
//   - Failed Stripe-Webhook-Calls (stripe_events.fehler IS NOT NULL)
//   - VS-Timer-Eskalationen (tasks.task_code LIKE 'VS-%' ueberfaellig)
//   - SVs ohne Login seit > 14 Tagen mit zugewiesenen Faellen
//   - Kanzlei-Tasks die ueberfaellig sind (tasks.phase='kanzlei')
//   - Faelle die im Status 'wartet auf Gutachter-Annahme' > 24h haengen
//   - Dispatcher-Faelle ohne SV (faelle.sv_id IS NULL > 1h)
//   - Faelle in Reklamation (status='reklamation')
//   - Failed Welcome-Mails (email_log status='failed')
//   - SVs deren Stripe-Einzug fehlgeschlagen ist

type Alert = {
  key: string
  text: string
  href: string
  severity: 'kritisch' | 'warnung'
}

async function loadAlerts(): Promise<Alert[]> {
  const supabase = await createClient()
  const alerts: Alert[] = []

  const nowIso = new Date().toISOString()
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()

  // 1. Faelle die > 24h im SV-Zugewiesen Status haengen ohne dass der SV
  // den Termin bestaetigt hat (gutachter_termin_bestaetigt=false).
  try {
    const { count: hangingFaelle } = await supabase
      .from('v_faelle_mit_aktuellem_termin')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'sv-zugewiesen')
      .eq('gutachter_termin_bestaetigt', false)
      .lt('sv_zugewiesen_am', dayAgo)
    if ((hangingFaelle ?? 0) > 0) {
      alerts.push({
        key: 'hanging-cases',
        text: `${hangingFaelle} Faelle warten seit > 24h auf SV-Annahme`,
        href: '/admin/dispatch',
        severity: 'kritisch',
      })
    }
  } catch { /* schema may differ */ }

  // 1b. Dispatcher-Faelle ohne SV — laenger als 1h ohne Zuweisung
  try {
    const { count: ohneSv } = await supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .is('sv_id', null)
      .in('status', ['ersterfassung', 'onboarding'])
      .lt('created_at', oneHourAgo)
    if ((ohneSv ?? 0) > 0) {
      alerts.push({
        key: 'ohne-sv',
        text: `${ohneSv} Dispatcher-Faelle ohne passenden SV im Gebiet`,
        href: '/admin/dispatch',
        severity: 'kritisch',
      })
    }
  } catch { /* ignore */ }

  // 1c. VS-Timer-Eskalationen (KFZ-148 Audit-System)
  // Tasks mit task_code LIKE 'VS-%' die ueberfaellig sind
  try {
    const { count: vsEsk } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .like('task_code', 'VS-%')
      .is('erledigt_am', null)
      .is('auto_resolved_am', null)
      .lt('deadline', nowIso)
    if ((vsEsk ?? 0) > 0) {
      alerts.push({
        key: 'vs-timer',
        text: `${vsEsk} VS-Timer-Eskalationen ueberfaellig`,
        href: '/admin/tasks',
        severity: 'kritisch',
      })
    }
  } catch { /* ignore */ }

  // 1d. Ueberfaellige Kanzlei-Tasks
  try {
    const { count: kanzleiTasks } = await supabase
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('phase', 'kanzlei')
      .is('erledigt_am', null)
      .is('auto_resolved_am', null)
      .lt('deadline', nowIso)
    if ((kanzleiTasks ?? 0) > 0) {
      alerts.push({
        key: 'kanzlei-tasks',
        text: `${kanzleiTasks} Kanzlei-Tasks ueberfaellig`,
        href: '/admin/tasks',
        severity: 'warnung',
      })
    }
  } catch { /* ignore */ }

  // 1e. SVs ohne Login seit > 14 Tagen, denen aktive Faelle zugewiesen sind.
  // Setzt voraus dass wir auth.users.last_sign_in_at lesen koennen — geht nur
  // ueber den Admin-Client (service_role). Defensive Try/Catch falls die
  // Berechtigungen fehlen.
  try {
    const admin = createAdminClient()
    // Liste der SVs mit zugewiesenen, nicht-abgeschlossenen Faellen
    const { data: assignedSvs } = await admin
      .from('faelle')
      .select('sv_id')
      .not('sv_id', 'is', null)
      .not('status', 'in', '("abgeschlossen","storniert")')
    const svIds = Array.from(new Set((assignedSvs ?? []).map(r => r.sv_id).filter(Boolean) as string[]))
    if (svIds.length > 0) {
      const { data: svProfiles } = await admin
        .from('sachverstaendige')
        .select('profile_id')
        .in('id', svIds)
      const profileIds = Array.from(new Set((svProfiles ?? []).map(r => r.profile_id).filter(Boolean) as string[]))

      // auth.users via Admin-API durchblaettern
      let inactiveCount = 0
      if (profileIds.length > 0) {
        const profileIdSet = new Set(profileIds)
        const { data: usersData } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
        for (const u of usersData?.users ?? []) {
          if (!profileIdSet.has(u.id)) continue
          if (!u.last_sign_in_at) { inactiveCount++; continue }
          if (u.last_sign_in_at < fourteenDaysAgo) inactiveCount++
        }
      }

      if (inactiveCount > 0) {
        alerts.push({
          key: 'inactive-sv',
          text: `${inactiveCount} SVs > 14 Tage ohne Login trotz aktiver Faelle`,
          href: '/admin/sachverstaendige',
          severity: 'warnung',
        })
      }
    }
  } catch (err) {
    console.error('[KFZ-155] Inactive-SV check failed:', err)
  }

  // 2. Faelle in Reklamation
  try {
    const { count: reklamation } = await supabase
      .from('faelle')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'reklamation')
    if ((reklamation ?? 0) > 0) {
      alerts.push({
        key: 'reklamation',
        text: `${reklamation} Faelle in Reklamation`,
        href: '/admin/reklamationen',
        severity: 'warnung',
      })
    }
  } catch { /* ignore */ }

  // 3. Failed Welcome-Mails
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: failedMails } = await supabase
      .from('email_log')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('created_at', sevenDaysAgo)
    if ((failedMails ?? 0) > 0) {
      alerts.push({
        key: 'failed-mails',
        text: `${failedMails} fehlgeschlagene Email-Versendungen (letzte 7 Tage)`,
        href: '/admin/einstellungen/vertraege',
        severity: 'warnung',
      })
    }
  } catch { /* ignore */ }

  // 4. SVs mit Einzugs-Fehler (stripe_einzug_fehlgeschlagen_am IS NOT NULL,
  //    falls die Spalte existiert)
  try {
    const { data: einzugFails } = await supabase
      .from('sachverstaendige')
      .select('id')
      .not('stripe_einzug_fehlgeschlagen_am', 'is', null)
      .limit(20)
    if ((einzugFails ?? []).length > 0) {
      alerts.push({
        key: 'einzug-fail',
        text: `${einzugFails!.length} SV-Stripe-Einzuege fehlgeschlagen`,
        href: '/admin/finance',
        severity: 'kritisch',
      })
    }
  } catch { /* spalte existiert evtl. nicht */ }

  // 5. Failed Stripe-Webhook-Calls (stripe_events.fehler IS NOT NULL)
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { count: webhookFails } = await supabase
      .from('stripe_events')
      .select('id', { count: 'exact', head: true })
      .not('fehler', 'is', null)
      .gte('empfangen_am', sevenDaysAgo)
    if ((webhookFails ?? 0) > 0) {
      alerts.push({
        key: 'webhook-fails',
        text: `${webhookFails} Stripe-Webhook-Events mit Fehler (letzte 7 Tage)`,
        href: '/admin/finance',
        severity: 'kritisch',
      })
    }
  } catch { /* spalte existiert evtl. nicht */ }

  // sortieren: kritisch zuerst
  alerts.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'kritisch' ? -1 : 1
    return 0
  })

  return alerts
}

export default async function KritischeUpdatesWidget() {
  const alerts = await loadAlerts()

  if (alerts.length === 0) {
    return (
      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
          <CheckCircle2Icon className="w-5 h-5 text-emerald-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-emerald-800">Alles ruhig</p>
          <p className="text-xs text-emerald-700">Keine kritischen Alerts. Gut so.</p>
        </div>
      </div>
    )
  }

  const top3 = alerts.slice(0, 3)
  const restCount = alerts.length - top3.length

  return (
    <div className="bg-red-50 border border-red-200 rounded-2xl overflow-hidden">
      <div className="px-5 py-3 border-b border-red-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center">
            <AlertTriangleIcon className="w-4 h-4 text-red-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-red-900">Kritische Updates</p>
            <p className="text-[11px] text-red-700">{alerts.length} {alerts.length === 1 ? 'Alert braucht' : 'Alerts brauchen'} Aufmerksamkeit</p>
          </div>
        </div>
      </div>
      <ul className="divide-y divide-red-200">
        {top3.map(a => (
          <li key={a.key}>
            <Link
              href={a.href}
              className="flex items-center gap-3 px-5 py-3 hover:bg-red-100/60 transition-colors"
            >
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.severity === 'kritisch' ? 'bg-red-600' : 'bg-amber-500'}`} />
              <p className="text-xs text-red-900 flex-1">{a.text}</p>
              <ArrowRightIcon className="w-3.5 h-3.5 text-red-400" />
            </Link>
          </li>
        ))}
      </ul>
      {restCount > 0 && (
        <div className="px-5 py-2.5 bg-red-100/50 text-center">
          <p className="text-[11px] text-red-700 font-medium">+ {restCount} weitere Alerts</p>
        </div>
      )}
    </div>
  )
}
