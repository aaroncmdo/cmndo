// AAR-61: Mitarbeiter-Portal Dashboard
// KB-Redesign 07/2026 ("Der Tag auf einen Blick"): Greeting + Dringlichkeits-Zeile,
// verbundene StatBar statt 6 gleicher Boxen, 2-Spalten (Arbeit links, "Anstehend"-
// Glance rechts) das mobil nach oben kippt. Datenschicht 1:1 erhalten.
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { FolderOpenIcon, CheckSquareIcon, MessageCircleIcon, AlertCircleIcon, CalendarIcon, PhoneCallIcon } from 'lucide-react'
import { StatBar } from '@/components/shared/StatBar'
import { Panel } from '@/components/shared/Panel'
import { cn } from '@/lib/utils'
import { getMyClaimWorkItems } from '@/lib/ops/get-claim-workitems'
import MeineArbeitBoard from '@/components/mitarbeiter/MeineArbeitBoard'

export const dynamic = 'force-dynamic'

type NestedFall = { id: string; claims: { claim_nummer: string | null } | { claim_nummer: string | null }[] | null } | null
function normFall(raw: unknown): NestedFall {
  const f = Array.isArray(raw) ? (raw[0] ?? null) : (raw as NestedFall)
  return f
}
function fallNummer(f: NestedFall): string | null {
  const c = Array.isArray(f?.claims) ? f?.claims[0] : f?.claims
  return c?.claim_nummer ?? null
}

type SchedItem = {
  id: string
  timeIso: string
  label: string
  meta: string
  href: string | null // null = kein valides Ziel (verwaister Rueckruf/Termin) -> nicht-klickbar
  overdue: boolean
  kind: 'rueckruf' | 'termin' | 'beratung'
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })
}
function fmtDay(iso: string) {
  return new Date(iso).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Berlin' })
}

export default async function MitarbeiterDashboard() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('vorname').eq('id', user.id).maybeSingle()
  const vorname = (profile?.vorname as string | null) ?? null

  // CMM-47 B-Rest: faelle → v_claim_full (Sync-Trigger garantiert kundenbetreuer_id-Konsistenz).
  // Board ersetzt die flache Liste; nur Count fuer StatBar + Panel-Header benoetigt.
  const { count: faelleCount } = await supabase
    .from('v_claim_full')
    .select('fall_id', { count: 'exact', head: true })
    .eq('kundenbetreuer_id', user.id)
    .neq('main_phase', 'abschluss')

  // Work-Items fuer das Board (v_claim_workstate im User-Kontext, RLS greift).
  const workItemsRes = await getMyClaimWorkItems(supabase, { kundenbetreuerId: user.id })
  const workItems = workItemsRes.ok ? workItemsRes.items : []

  // Offene Tasks — eigene ODER unassigned KB-Broadcast-Tasks (Dashboard-Audit 29.06.).
  const { data: tasks, count: tasksCount } = await supabase
    .from('tasks')
    .select('id, titel, fall_id, prioritaet, faellig_am, created_at', { count: 'exact' })
    .or(`zugewiesen_an.eq.${user.id},and(empfaenger_rolle.eq.kundenbetreuer,zugewiesen_an.is.null)`)
    .eq('status', 'offen')
    .order('faellig_am', { ascending: true, nullsFirst: false })
    .limit(8)

  const { count: unreadCount } = await supabase
    .from('nachrichten')
    .select('id', { count: 'exact', head: true })
    .eq('gelesen', false)
    .neq('sender_id', user.id)

  let reklamationenCount = 0
  try {
    // FIX (Status-Enum-Audit 05.07.): reklamationen.status kennt kein 'offen' -> Count war immer 0.
    const { count } = await supabase.from('reklamationen').select('id', { count: 'exact', head: true }).in('status', ['eingereicht', 'pruefung'])
    reklamationenCount = count ?? 0
  } catch { /* Tabelle evtl. nicht vorhanden */ }

  // AAR-637 + AAR-640: Rückrufe, Admin-Termine UND KB-Beratungen
  const nowIso = new Date().toISOString()
  const nowMs = Date.now()
  const [rueckrufR, termineR, kbR] = await Promise.all([
    supabase
      .from('admin_termine')
      .select(
        'id, start_zeit, titel, notizen, lead_id, fall_id, lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon), fall:faelle_claim_bridge!admin_termine_fall_id_fkey(id:fall_id, claims:claim_id(claim_nummer))',
      )
      .eq('typ', 'rueckruf')
      .eq('status', 'offen')
      .eq('zugewiesen_an', user.id)
      .order('start_zeit', { ascending: true })
      .limit(5),
    supabase
      .from('admin_termine')
      .select('id, typ, start_zeit, titel, fall_id, lead_id, fall:faelle_claim_bridge!admin_termine_fall_id_fkey(id:fall_id, claims:claim_id(claim_nummer))')
      .in('typ', ['kunde', 'intern'])
      .eq('status', 'offen')
      .eq('zugewiesen_an', user.id)
      .gte('start_zeit', nowIso)
      .order('start_zeit', { ascending: true })
      .limit(5),
    supabase
      .from('gutachter_termine')
      .select('id, start_zeit, kanal, fall_id, fall:faelle_claim_bridge!gutachter_termine_fall_id_fkey(id:fall_id, claims:claim_id(claim_nummer))')
      .eq('typ', 'kb_beratung')
      .eq('kb_id', user.id)
      .in('status', ['reserviert', 'bestaetigt'])
      .is('cancelled_at', null)
      .gte('start_zeit', nowIso)
      .order('start_zeit', { ascending: true })
      .limit(5),
  ])
  const meineRueckrufe = rueckrufR.data ?? []
  const meineAdminTermine = termineR.data ?? []
  const meineKbTermine = kbR.data ?? []
  const meineTermineAnzahl = meineAdminTermine.length + meineKbTermine.length
  const overdueRueckrufe = meineRueckrufe.filter((r) => new Date(r.start_zeit as string).getTime() < nowMs).length

  // "Anstehend" — Rückrufe + Termine + KB-Beratungen zu EINER zeit-sortierten Liste (überfällige zuerst).
  const schedule: SchedItem[] = []
  for (const r of meineRueckrufe) {
    const leadRaw = r.lead as unknown
    const lead = Array.isArray(leadRaw) ? (leadRaw[0] ?? null) : (leadRaw as { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | null)
    const fall = normFall(r.fall)
    const name = lead ? [lead.vorname, lead.nachname].filter(Boolean).join(' ') : fallNummer(fall) ?? (r.titel as string)
    schedule.push({
      id: `r-${r.id}`,
      timeIso: r.start_zeit as string,
      label: name || 'Rückruf',
      meta: lead?.telefon ?? 'Rückruf',
      href: lead ? `/dispatch/leads/${lead.id}` : fall ? `/faelle/${fall.id}` : null,
      overdue: new Date(r.start_zeit as string).getTime() < nowMs,
      kind: 'rueckruf',
    })
  }
  for (const t of meineAdminTermine) {
    const fall = normFall(t.fall)
    schedule.push({
      id: `t-${t.id}`,
      timeIso: t.start_zeit as string,
      label: (t.titel as string) || 'Termin',
      meta: [fallNummer(fall), t.typ].filter(Boolean).join(' · '),
      // Fix: lead-Fallback, falls kein Fall (kunde/intern-Termin mit lead_id).
      href: fall ? `/faelle/${fall.id}` : t.lead_id ? `/dispatch/leads/${t.lead_id}` : null,
      overdue: false,
      kind: 'termin',
    })
  }
  for (const k of meineKbTermine) {
    const fall = normFall(k.fall)
    schedule.push({
      id: `k-${k.id}`,
      timeIso: k.start_zeit as string,
      label: 'KB-Beratung',
      meta: [fallNummer(fall), k.kanal].filter(Boolean).join(' · '),
      // Fix: KB-Beratung oeffnet das Konsultations-Cockpit (per Termin-id, immer valide),
      // nicht die Fallakte — konsistent zu mitarbeiter/termine + funktioniert fuer claim-lose Leads.
      href: `/mitarbeiter/konsultation/${k.id}`,
      overdue: false,
      kind: 'beratung',
    })
  }
  schedule.sort((a, b) => new Date(a.timeIso).getTime() - new Date(b.timeIso).getTime())
  const scheduleTop = schedule.slice(0, 8)

  const dateStr = new Date().toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' })

  // Dringlichkeits-Zeile
  const seg: { t: string; danger?: boolean }[] = []
  if (meineRueckrufe.length) seg.push({ t: `${meineRueckrufe.length} ${meineRueckrufe.length === 1 ? 'Rückruf' : 'Rückrufe'}` })
  if (overdueRueckrufe) seg.push({ t: `${overdueRueckrufe} überfällig`, danger: true })
  if (tasksCount) seg.push({ t: `${tasksCount} ${tasksCount === 1 ? 'Task' : 'Tasks'}` })
  if (unreadCount) seg.push({ t: `${unreadCount} ungelesen` })

  const dotFor = (kind: SchedItem['kind']) =>
    kind === 'rueckruf' ? 'bg-warning' : kind === 'beratung' ? 'bg-success' : 'bg-claimondo-ondo'

  return (
    <div className="space-y-5">
      {/* Greeting + Dringlichkeits-Zeile */}
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

      {/* Metrik-Leiste */}
      <StatBar
        items={[
          { label: 'Aktive Fälle', value: faelleCount ?? 0, icon: FolderOpenIcon, href: '/mitarbeiter/faelle' },
          { label: 'Offene Tasks', value: tasksCount ?? 0, icon: CheckSquareIcon, href: '/mitarbeiter/tasks' },
          { label: 'Rückrufe', value: meineRueckrufe.length, icon: PhoneCallIcon, href: '/mitarbeiter/termine', tone: overdueRueckrufe ? 'warning' : 'default' },
          { label: 'Termine', value: meineTermineAnzahl, icon: CalendarIcon, href: '/mitarbeiter/termine' },
          { label: 'Ungelesen', value: unreadCount ?? 0, icon: MessageCircleIcon, href: '/mitarbeiter/nachrichten' },
          { label: 'Reklamationen', value: reklamationenCount, icon: AlertCircleIcon, href: '/mitarbeiter/reklamationen', tone: reklamationenCount ? 'danger' : 'default' },
        ]}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Anstehend — mobil zuerst (Zeitkritisches), auf lg die rechte Spalte */}
        <div className="lg:order-2">
          <Panel title="Anstehend" icon={<CalendarIcon className="h-4 w-4 text-claimondo-ondo" />} actionLabel="Kalender →" actionHref="/mitarbeiter/termine">
            {scheduleTop.length === 0 ? (
              <p className="px-4 py-8 text-center text-body-sm text-claimondo-ondo/70">Keine Rückrufe oder Termine</p>
            ) : (
              scheduleTop.map((s) => {
                const inner = (
                  <>
                    <div className="w-11 shrink-0 text-right">
                      <div className={cn('text-body-sm font-semibold leading-tight tabular-nums', s.overdue ? 'text-danger-strong' : 'text-claimondo-navy')}>
                        {fmtTime(s.timeIso)}
                      </div>
                      <div className="text-body-xs text-claimondo-ondo/70">{fmtDay(s.timeIso)}</div>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body-sm font-medium text-claimondo-navy">{s.label}</p>
                      <p className={cn('truncate text-body-xs', s.overdue ? 'font-medium text-danger' : 'text-claimondo-ondo')}>
                        {s.overdue ? 'überfällig · ' : ''}{s.meta}
                      </p>
                    </div>
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', dotFor(s.kind))} />
                  </>
                )
                // Ziel-loser Rueckruf/Termin (kein lead + kein fall) -> nicht-klickbar statt totem href='#'.
                return s.href ? (
                  <Link key={s.id} href={s.href} className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-claimondo-bg">
                    {inner}
                  </Link>
                ) : (
                  <div key={s.id} className="flex items-start gap-3 px-4 py-3">
                    {inner}
                  </div>
                )
              })
            )}
          </Panel>
        </div>

        {/* Arbeit — Fälle + Tasks */}
        <div className="space-y-5 lg:order-1">
          <Panel title="Meine Fälle" count={faelleCount ?? 0} actionLabel="Alle anzeigen →" actionHref="/mitarbeiter/faelle">
            <div className="p-3">
              <MeineArbeitBoard items={workItems} />
            </div>
          </Panel>

          <Panel title="Offene Tasks" count={tasksCount ?? 0} actionLabel="Alle anzeigen →" actionHref="/mitarbeiter/tasks">
            {(tasks ?? []).length === 0 ? (
              <p className="px-4 py-8 text-center text-body-sm text-claimondo-ondo/70">Keine offenen Tasks</p>
            ) : (
              (tasks ?? []).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 py-0.5 text-caption font-bold',
                        t.prioritaet === 'kritisch'
                          ? 'bg-danger-soft text-danger-strong'
                          : t.prioritaet === 'dringend'
                            ? 'bg-warning-soft text-warning-strong'
                            : 'bg-claimondo-bg text-claimondo-ondo',
                      )}
                    >
                      {t.prioritaet}
                    </span>
                    <span className="truncate text-body-sm text-claimondo-navy">{t.titel}</span>
                  </div>
                  <span className="shrink-0 text-body-xs text-claimondo-ondo/70">
                    {t.faellig_am ? new Date(t.faellig_am as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                </div>
              ))
            )}
          </Panel>
        </div>
      </div>
    </div>
  )
}
