import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { UsersIcon, PhoneIcon, LinkIcon, ClockIcon } from 'lucide-react'
import { PHASE_LABELS, PHASE_BADGES } from '../leads/_components/leadPhaseConstants'
import PageHeader from '@/components/shared/PageHeader'

export default async function DispatchDashboard() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return null

  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)

  // Parallel queries
  const [newLeadsRes, openRueckrufeRes, flowLinksRes, myTasksRes, recentLeadsRes] = await Promise.all([
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
    // FlowLinks versendet heute — flow_links benutzt `erstellt_am`, nicht `created_at`
    supabase
      .from('flow_links')
      .select('*', { count: 'exact', head: true })
      .gte('erstellt_am', todayStart.toISOString()),
    // Meine offenen Tasks
    supabase
      .from('tasks')
      .select('id, titel, typ, prioritaet, faellig_am, fall_id, created_at')
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
  ])

  const stats = [
    { label: 'Neue Leads heute', value: newLeadsRes.count ?? 0, icon: UsersIcon, color: 'text-claimondo-ondo', bg: 'bg-[#f8f9fb]', href: '/dispatch/leads' },
    { label: 'Offene Rückrufe', value: openRueckrufeRes.count ?? 0, icon: PhoneIcon, color: 'text-amber-600', bg: 'bg-amber-50', href: '/dispatch/rueckrufe' },
    { label: 'FlowLinks versendet', value: flowLinksRes.count ?? 0, icon: LinkIcon, color: 'text-emerald-600', bg: 'bg-emerald-50', href: '/dispatch/leads' },
  ]

  const tasks = myTasksRes.data ?? []
  const recentLeads = recentLeadsRes.data ?? []

  function timeSince(d: string): string {
    const h = Math.floor((Date.now() - new Date(d).getTime()) / 3600000)
    if (h < 1) return `${Math.floor((Date.now() - new Date(d).getTime()) / 60000)}m`
    if (h < 24) return `${h}h`
    return `${Math.floor(h / 24)}d`
  }

  return (
    <div className="py-6 space-y-6">
      <PageHeader title="Dispatch Dashboard" size="lg" />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href} className="bg-white rounded-ios-lg shadow-ios-sm p-5 flex items-center gap-4 hover:shadow-ios-md transition-shadow">
            <div className={`w-11 h-11 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-5 h-5 ${s.color}`} />
            </div>
            <div>
              <p className="text-2xl font-bold text-claimondo-navy">{s.value}</p>
              <p className="text-xs text-claimondo-ondo">{s.label}</p>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Live-Feed: Neueste Leads */}
        <div className="bg-white rounded-ios-lg shadow-ios-md">
          <div className="px-5 py-4 border-b border-claimondo-border flex items-center justify-between">
            <h2 className="text-sm font-semibold text-claimondo-navy">Neueste Leads</h2>
            <Link href="/dispatch/leads" className="text-xs text-[#4573A2] hover:underline">Alle anzeigen</Link>
          </div>
          <div className="divide-y divide-claimondo-border max-h-[400px] overflow-y-auto">
            {recentLeads.map((lead) => (
              <Link key={lead.id} href={`/dispatch/leads/${lead.id}`} className="flex items-center gap-3 px-5 py-3 hover:bg-[#f8f9fb] transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-claimondo-navy truncate">
                    {lead.vorname} {lead.nachname}
                  </p>
                  <p className="text-xs text-claimondo-ondo">{lead.telefon} {lead.schadens_fall_typ ? `· ${lead.schadens_fall_typ}` : ''}</p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap ${PHASE_BADGES[lead.qualifizierungs_phase] ?? 'bg-[#f8f9fb] text-claimondo-ondo'}`}>
                  {PHASE_LABELS[lead.qualifizierungs_phase] ?? lead.qualifizierungs_phase}
                </span>
                <span className="text-[10px] text-claimondo-ondo/70 whitespace-nowrap">{timeSince(lead.created_at)}</span>
              </Link>
            ))}
            {recentLeads.length === 0 && (
              <p className="px-5 py-8 text-sm text-claimondo-ondo/70 text-center">Keine Leads vorhanden</p>
            )}
          </div>
        </div>

        {/* Meine Tasks */}
        <div className="bg-white rounded-ios-lg shadow-ios-md">
          <div className="px-5 py-4 border-b border-claimondo-border">
            <h2 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
              <ClockIcon className="w-4 h-4 text-claimondo-ondo/70" />
              Offene Dispatch-Tasks
              {tasks.length > 0 && (
                <span className="ml-auto bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">{tasks.length}</span>
              )}
            </h2>
          </div>
          <div className="divide-y divide-claimondo-border max-h-[400px] overflow-y-auto">
            {tasks.map((task) => (
              <div key={task.id} className="px-5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-claimondo-navy truncate">{task.titel}</p>
                  <p className="text-xs text-claimondo-ondo/70">{task.faellig_am ? new Date(task.faellig_am).toLocaleDateString('de-DE') : ''}</p>
                </div>
                {task.prioritaet === 'dringend' && (
                  <span className="text-[10px] font-medium bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Dringend</span>
                )}
              </div>
            ))}
            {tasks.length === 0 && (
              <p className="px-5 py-8 text-sm text-claimondo-ondo/70 text-center">Keine offenen Tasks</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
