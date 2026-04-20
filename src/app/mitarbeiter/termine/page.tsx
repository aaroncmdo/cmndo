// AAR-637: Mitarbeiter-Terminübersicht. Zeigt alle meine admin_termine
// (zugewiesen_an = user.id) gruppiert nach Tag. Kalender-Charakter weil
// KB/LB sowohl Rückrufe als auch Kundentermine haben.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PhoneCallIcon, CalendarIcon, UsersIcon } from 'lucide-react'

export const dynamic = 'force-dynamic'

const TYP_META: Record<string, { label: string; icon: typeof PhoneCallIcon; cls: string }> = {
  rueckruf: { label: 'Rückruf', icon: PhoneCallIcon, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  kunde: { label: 'Kunde', icon: UsersIcon, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  intern: { label: 'Intern', icon: CalendarIcon, cls: 'bg-gray-50 text-gray-700 border-gray-200' },
}

export default async function MitarbeiterTermine() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const nowIso = new Date().toISOString()

  type TerminRow = {
    id: string
    typ: string
    titel: string
    start_zeit: string
    end_zeit: string
    status: string
    notizen: string | null
    lead_id: string | null
    fall_id: string | null
    lead: { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | { id: string; vorname: string | null; nachname: string | null; telefon: string | null }[] | null
    fall: { id: string; fall_nummer: string | null } | { id: string; fall_nummer: string | null }[] | null
  }

  const { data: rawTermine } = await supabase
    .from('admin_termine')
    .select(
      'id, typ, titel, start_zeit, end_zeit, status, notizen, lead_id, fall_id, ' +
        'lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon), ' +
        'fall:faelle!admin_termine_fall_id_fkey(id, fall_nummer)',
    )
    .eq('zugewiesen_an', user.id)
    .eq('status', 'offen')
    .gte('start_zeit', new Date(Date.now() - 24 * 3600 * 1000).toISOString())
    .order('start_zeit', { ascending: true })

  const termine = (rawTermine ?? []) as unknown as TerminRow[]

  const groups = new Map<string, TerminRow[]>()
  for (const t of termine) {
    const dayKey = new Date(t.start_zeit).toISOString().slice(0, 10)
    const bucket = groups.get(dayKey) ?? []
    bucket.push(t)
    groups.set(dayKey, bucket)
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#0D1B3E]">Meine Termine</h1>
        <p className="text-sm text-gray-500 mt-1">
          Rückrufe und Kundentermine, die dir zugewiesen sind.
        </p>
      </div>

      {groups.size === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 px-6 py-16 text-center">
          <p className="text-sm text-gray-400">Keine offenen Termine</p>
        </div>
      )}

      {Array.from(groups.entries()).map(([day, rows]) => {
        const isToday = day === nowIso.slice(0, 10)
        return (
          <section key={day} className="bg-white rounded-xl border border-gray-200">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900">
                {new Date(day + 'T00:00:00').toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                })}
                {isToday && <span className="ml-2 text-xs text-[#4573A2]">(heute)</span>}
              </h2>
              <span className="text-xs text-gray-500">{rows?.length ?? 0}</span>
            </div>
            <div className="divide-y divide-gray-50">
              {(rows ?? []).map((t) => {
                const meta = TYP_META[t.typ] ?? TYP_META.intern
                const Icon = meta.icon
                const leadRaw = t.lead as unknown
                const lead = Array.isArray(leadRaw) ? leadRaw[0] ?? null : (leadRaw as { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | null)
                const fallRaw = t.fall as unknown
                const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; fall_nummer: string | null } | null)
                const subject = lead
                  ? `${[lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Lead'}`
                  : fall?.fall_nummer ?? t.titel
                const href = lead ? `/dispatch/leads/${lead.id}` : fall ? `/faelle/${fall.id}` : '#'
                const overdue = new Date(t.start_zeit) < new Date()
                return (
                  <Link key={t.id} href={href} className="block px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{subject}</p>
                        <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-gray-500'}`}>
                          {new Date(t.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          {t.notizen && ` · ${t.notizen}`}
                          {overdue && ' (überfällig)'}
                        </p>
                      </div>
                      {lead?.telefon && (
                        <span className="text-xs text-gray-400 hidden sm:block">{lead.telefon}</span>
                      )}
                    </div>
                  </Link>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
