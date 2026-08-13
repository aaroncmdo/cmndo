import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import { UsersIcon, PhoneIcon, LinkIcon, ClockIcon, AlertCircleIcon, InboxIcon, CheckCircleIcon } from 'lucide-react'
import { PHASE_LABELS, PHASE_BADGES } from '../leads/_components/leadPhaseConstants'
import { StatBar, type StatBarItem } from '@/components/shared/StatBar'
import EmptyState from '@/components/shared/EmptyState'
import { Panel } from '@/components/shared/Panel'
import EmbedBKlaerungCard from '@/components/dispatch/EmbedBKlaerungCard'
import FestgefahreneFaelleCard from '@/components/dispatch/FestgefahreneFaelleCard'
import { LeadPipelinePanel } from './_components/LeadPipelinePanel'
import { EMBED_B_KLAERUNG_TASK_TYP } from '@/lib/termine/embed-b-klaerung-task'
import { ladeFestgefahreneFaelle } from '@/lib/sla/festgefahrene-faelle'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

export default async function DispatchDashboard() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null
  // RLS-Phase-1 (#3): flow_links wird default-deny für authenticated nach der
  // Migration. Dispatch-Auth ist bereits via Layout-Guard `requirePortalAccess`
  // sichergestellt — daher hier admin-Client für die Count-Query.
  const admin = createAdminClient()

  // FIX (Dashboard-Audit 29.06., analog AAR-958): echte Berlin-Tagesgrenze statt setHours(0,0,0,0)
  // (= Server-lokal = UTC auf Vercel -> "heute" war am Tagesrand 1-2h schief). berlinWallClockToUtc
  // ist das etablierte Helfer-Pattern (sv-reminder.ts/verlegung-vorschlaege.ts).
  const berlinDateStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })
  const todayStart = new Date(berlinWallClockToUtc(`${berlinDateStr}T00:00:00`))

  // Parallel queries
  const [newLeadsRes, openRueckrufeRes, flowLinksRes, myTasksRes, recentLeadsRes, kommendeRueckrufeRes, offeneTasksRes] = await Promise.all([
    // Neue Leads heute
    supabase
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', todayStart.toISOString()),
    // Offene Rückrufe (AAR-637: SoT ist admin_termine)
    supabase
      .from('admin_termine')
      .select('*', { count: 'exact', head: true })
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .not('lead_id', 'is', null),
    // FlowLinks versendet heute — flow_links benutzt `erstellt_am`, nicht `created_at`.
    // RLS-Phase-1: via admin-Client weil flow_links default-deny für authenticated.
    admin
      .from('flow_links')
      .select('*', { count: 'exact', head: true })
      .gte('erstellt_am', todayStart.toISOString()),
    // Meine offenen Tasks
    supabase
      .from('tasks')
      .select('id, titel, typ, prioritaet, faellig_am, fall_id, lead_id, created_at')
      .eq('typ', 'dispatch')
      .eq('status', 'offen')
      .order('created_at', { ascending: false })
      .limit(10),
    // Neueste Leads (Live-Feed)
    supabase
      .from('leads')
      .select('id, vorname, nachname, telefon, qualifizierungs_phase, schadens_fall_typ, source_channel, created_at')
      .order('created_at', { ascending: false })
      .limit(15),
    // Kommende Rückrufe (Timeline) — nächste 12, sortiert nach Datum
    supabase
      .from('admin_termine')
      .select(
        'id, start_zeit, notizen, lead_id, gesehen_am, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon)',
      )
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .not('lead_id', 'is', null)
      .order('start_zeit', { ascending: true })
      .limit(12),
    // Ops-Test 13.08.: ECHTE Anzahl offener Dispatch-Aufgaben. Die Kennzahl darunter
    // stand vorher auf `tasks.length` — und `tasks` ist die auf 10 limitierte Liste.
    // Bei 347 offenen Aufgaben zeigte das Dashboard dauerhaft „10", was den Rueckstand
    // nicht nur verschwieg, sondern aktiv harmlos aussehen liess.
    supabase
      .from('tasks')
      .select('*', { count: 'exact', head: true })
      .eq('typ', 'dispatch')
      .eq('status', 'offen'),
  ])

  const tasks = myTasksRes.data ?? []
  const offeneTasksGesamt = offeneTasksRes.count ?? 0
  const recentLeads = recentLeadsRes.data ?? []

  // Tasks mit fall_id aber ohne lead_id → Bulk-Resolve via faelle.lead_id,
  // damit das Dashboard direkt in die Lead-Maske linkt (Aaron-Wunsch).
  const fallOnlyTasks = tasks.filter((t) => !t.lead_id && t.fall_id)
  const fallToLeadMap = new Map<string, string>()
  if (fallOnlyTasks.length > 0) {
    const fallIds = Array.from(new Set(fallOnlyTasks.map((t) => t.fall_id as string)))
    // CMM-49 (faelle-Drop-Runway): fall_id->lead_id via Bridge+claims statt .from('faelle').
    // lead_id lebt auf claims (SSoT, Divergenz=0); jede faelle hat Bridge-Row (0 missing, live verifiziert).
    const { data: faelleRows } = await supabase
      .from('faelle_claim_bridge')
      .select('fall_id, claims:claims!fk_bridge_claim!inner(lead_id)')
      .in('fall_id', fallIds)
    for (const f of (faelleRows ?? []) as Array<{ fall_id: string; claims: { lead_id: string | null } | { lead_id: string | null }[] | null }>) {
      const c = Array.isArray(f.claims) ? f.claims[0] : f.claims
      if (c?.lead_id) fallToLeadMap.set(f.fall_id, c.lead_id)
    }
  }
  function leadIdForTask(t: { lead_id: string | null; fall_id: string | null }): string | null {
    if (t.lead_id) return t.lead_id
    if (t.fall_id && fallToLeadMap.has(t.fall_id)) return fallToLeadMap.get(t.fall_id)!
    return null
  }
  type RueckrufRow = {
    id: string
    start_zeit: string
    notizen: string | null
    lead_id: string | null
    gesehen_am: string | null
    lead:
      | { id: string; vorname: string | null; nachname: string | null; telefon: string | null }
      | { id: string; vorname: string | null; nachname: string | null; telefon: string | null }[]
      | null
  }
  const kommendeRueckrufe = ((kommendeRueckrufeRes.data ?? []) as unknown as RueckrufRow[]).map((r) => ({
    ...r,
    lead: Array.isArray(r.lead) ? r.lead[0] ?? null : r.lead,
  }))

  // AAR-939: offene embed-B Klaerungs-Tasks (ungeklaerte nur_gutachter-Termine) —
  // das Team loest sie auf (SV-No-Show bestaetigen / doch durchgefuehrt).
  const { data: klaerungTasksRaw } = await admin
    .from('tasks')
    .select('id, titel, entity_id, created_at')
    .eq('task_typ', EMBED_B_KLAERUNG_TASK_TYP)
    .eq('status', 'offen')
    .order('created_at', { ascending: true })
  const klaerungTerminIds = (klaerungTasksRaw ?? [])
    .map((t) => t.entity_id as string | null)
    .filter((x): x is string => !!x)
  const klaerungTerminMap = new Map<string, string | null>()
  if (klaerungTerminIds.length > 0) {
    const { data: kt } = await admin
      .from('gutachter_termine')
      .select('id, start_zeit')
      .in('id', klaerungTerminIds)
    for (const t of (kt ?? []) as Array<{ id: string; start_zeit: string | null }>) {
      klaerungTerminMap.set(t.id, t.start_zeit)
    }
  }
  const klaerungItems = (klaerungTasksRaw ?? [])
    .filter((t) => t.entity_id)
    .map((t) => ({
      taskId: t.id as string,
      terminId: t.entity_id as string,
      titel: (t.titel as string | null) ?? 'Gutachter-Termin klären',
      startZeit: klaerungTerminMap.get(t.entity_id as string) ?? null,
    }))

  // Festgefahrene Faelle (Aaron 03.07., Option B): Claims mit verletzter SLA, die
  // operativ haengen (kein Gutachter zugewiesen / Termin unbestaetigt). Diese
  // kritischen Signale sah Dispatch bisher NIRGENDS (nur /admin/sla als flache
  // Tabelle) — die roh-`sla_breach`-Tasks werden von keiner UI gerendert.
  const festgefahrene = await ladeFestgefahreneFaelle()

  function timeSince(d: string): string {
    const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
    if (h < 1) return `${Math.floor((Date.now() - new Date(d).getTime()) / 60000)}m`
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  const { data: profile } = await supabase.from('profiles').select('vorname').eq('id', user.id).maybeSingle()
  const vorname = (profile?.vorname as string | null) ?? null
  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })
  const overdueRueckrufe = kommendeRueckrufe.filter((r) => r.lead && new Date(r.start_zeit).getTime() < Date.now()).length
  const seg: { t: string; danger?: boolean }[] = []
  if (festgefahrene.length) seg.push({ t: `${festgefahrene.length} festgefahrene ${festgefahrene.length === 1 ? 'Fall' : 'Fälle'}`, danger: true })
  if (overdueRueckrufe) seg.push({ t: `${overdueRueckrufe} ${overdueRueckrufe === 1 ? 'überfälliger Rückruf' : 'überfällige Rückrufe'}`, danger: true })
  if (newLeadsRes.count) seg.push({ t: `${newLeadsRes.count} ${newLeadsRes.count === 1 ? 'neuer Lead' : 'neue Leads'} heute` })
  if (offeneTasksGesamt) seg.push({ t: `${offeneTasksGesamt} ${offeneTasksGesamt === 1 ? 'offene Aufgabe' : 'offene Aufgaben'}` })
  const statBarItems: StatBarItem[] = [
    { label: 'Neue Leads heute', value: newLeadsRes.count ?? 0, icon: UsersIcon, href: '/dispatch/leads' },
    { label: 'Offene Rückrufe', value: openRueckrufeRes.count ?? 0, icon: PhoneIcon, href: '/dispatch/rueckrufe', tone: (openRueckrufeRes.count ?? 0) > 0 ? 'warning' : 'default' },
    { label: 'FlowLinks heute', value: flowLinksRes.count ?? 0, icon: LinkIcon, href: '/dispatch/leads', tone: 'success' },
    { label: 'Offene Aufgaben', value: offeneTasksGesamt, icon: ClockIcon, href: '/dispatch/tasks' },
  ]

  return (
    <div className="py-6 space-y-5">
      {/* Greeting + Dringlichkeits-Zeile (Redesign 07/2026 — konsistent mit KB/Admin-Dashboard) */}
      <div>
        <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-heading-lg font-bold text-claimondo-navy">
            Guten Tag{vorname ? `, ${vorname}` : ''}
          </h1>
          <p className="text-body-sm font-medium capitalize text-claimondo-ondo">{dateStr}</p>
        </div>
        <p className="mt-1 text-body-sm text-claimondo-ondo">
          {seg.length ? (
            seg.map((s, i) => (
              <span key={i}>
                {i > 0 ? <span className="text-claimondo-ondo/50"> · </span> : null}
                <span className={s.danger ? 'font-semibold text-danger-strong' : undefined}>{s.t}</span>
              </span>
            ))
          ) : (
            'Alles im grünen Bereich — nichts Dringendes.'
          )}
        </p>
      </div>

      <StatBar items={statBarItems} />

      {/* Festgefahrene Fälle (Aaron 03.07., Option B): SLA-verletzte Claims, die
          operativ haengen — prominent oben, jede Zeile klickbar in die Lead-Maske. */}
      {festgefahrene.length > 0 && <FestgefahreneFaelleCard items={festgefahrene} />}

      {/* Ops-Cockpit Phase 3b: Lead-Pipeline — aktive Leads nach abgeleitetem Arbeitszustand. */}
      <LeadPipelinePanel />

      {/* Rückrufe-Timeline: chronologische Liste, Click → Rückrufe-Liste mit Auto-Open-Popover */}
      <Panel
        title="Rückrufe-Timeline"
        icon={<PhoneIcon className="w-4 h-4 text-warning" />}
        count={kommendeRueckrufe.length || undefined}
        actionLabel="Alle anzeigen"
        actionHref="/dispatch/rueckrufe"
        bodyClassName="max-h-[320px] overflow-y-auto"
      >
        {kommendeRueckrufe.map((r) => {
          const lead = r.lead
          if (!lead) return null
          const start = new Date(r.start_zeit)
          const isOverdue = start.getTime() < Date.now()
          const datum = start.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' })
          const uhrzeit = start.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
          const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Unbekannt'
          return (
            <Link
              key={r.id}
              href={`/dispatch/rueckrufe?open=${r.id}`}
              className="flex items-center gap-3 px-5 py-3 hover:bg-claimondo-navy/[0.03] transition-colors"
            >
              {!r.gesehen_am && (
                <span className="w-2 h-2 rounded-full bg-danger shrink-0" aria-label="Neu" />
              )}
              <div className={`flex flex-col items-center justify-center w-14 shrink-0 rounded-ios-lg py-1.5 ${
                isOverdue ? 'bg-danger-soft text-danger-strong' : 'bg-warning-soft text-warning-strong'
              }`}>
                <span className="text-[10px] font-medium uppercase tracking-wider">{datum}</span>
                <span className="text-sm font-bold">{uhrzeit}</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-claimondo-navy truncate">{name}</p>
                {lead.telefon && (
                  <p className="text-xs text-claimondo-ondo truncate">{lead.telefon}</p>
                )}
                {r.notizen && (
                  <p className="text-[11px] text-claimondo-ondo/70 truncate">{r.notizen}</p>
                )}
              </div>
              {isOverdue && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium text-danger-strong bg-danger-soft px-2 py-0.5 rounded-full shrink-0">
                  <AlertCircleIcon className="w-3 h-3" />
                  Überfällig
                </span>
              )}
            </Link>
          )
        })}
        {kommendeRueckrufe.length === 0 && (
          <EmptyState icon={PhoneIcon} title="Keine offenen Rückrufe" variant="compact" />
        )}
      </Panel>

      {/* AAR-939: Ungeklärte embed-B/nur_gutachter-Termine auflösen (SV-No-Show / durchgeführt). */}
      {klaerungItems.length > 0 && <EmbedBKlaerungCard items={klaerungItems} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live-Feed: Neueste Leads */}
        <Panel title="Neueste Leads" actionLabel="Alle anzeigen" actionHref="/dispatch/leads" bodyClassName="max-h-[400px] overflow-y-auto">
          {recentLeads.map((lead) => (
              <Link key={lead.id} href={`/dispatch/leads/${lead.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-claimondo-navy/[0.03] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">
                    {lead.vorname} {lead.nachname}
                  </p>
                  <p className="text-xs text-claimondo-ondo">{lead.telefon} {lead.schadens_fall_typ ? `· ${lead.schadens_fall_typ}` : ''}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PHASE_BADGES[lead.qualifizierungs_phase] ?? 'bg-claimondo-bg text-claimondo-ondo'}`}>
                  {PHASE_LABELS[lead.qualifizierungs_phase] ?? lead.qualifizierungs_phase}
                </span>
                <span className="text-[10px] text-claimondo-ondo/70 whitespace-nowrap">{timeSince(lead.created_at)}</span>
              </Link>
            ))}
          {recentLeads.length === 0 && (
            <EmptyState icon={InboxIcon} title="Keine Leads vorhanden" variant="compact" />
          )}
        </Panel>

        {/* Meine Tasks */}
        <Panel
          title="Offene Dispatch-Tasks"
          icon={<ClockIcon className="w-4 h-4 text-claimondo-ondo/70" />}
          count={tasks.length || undefined}
          bodyClassName="max-h-[400px] overflow-y-auto"
        >
          {tasks.map((task) => {
              const leadId = leadIdForTask(task)
              const inner = (
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-claimondo-navy truncate">{task.titel}</p>
                  <p className="text-xs text-claimondo-ondo/70">{task.faellig_am ? new Date(task.faellig_am).toLocaleDateString('de-DE') : ''}</p>
                </div>
              )
              return leadId ? (
                <Link key={task.id} href={`/dispatch/leads/${leadId}`} className="px-5 py-3 flex items-center gap-3 hover:bg-claimondo-navy/[0.03] transition-colors">
                  {inner}
                </Link>
              ) : (
                <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                  {inner}
                </div>
              )
            })}
            {tasks.length === 0 && (
              <EmptyState icon={CheckCircleIcon} title="Keine offenen Tasks" variant="compact" />
            )}
        </Panel>
      </div>
    </div>
  )
}
