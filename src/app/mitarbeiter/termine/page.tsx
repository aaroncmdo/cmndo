// AAR-637: Mitarbeiter-Terminübersicht. Zeigt alle meine admin_termine
// (zugewiesen_an = user.id) gruppiert nach Tag. Kalender-Charakter weil
// KB/LB sowohl Rückrufe als auch Kundentermine haben.

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { PhoneCallIcon, CalendarIcon, UsersIcon } from 'lucide-react'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

const TYP_META: Record<string, { label: string; icon: typeof PhoneCallIcon; cls: string }> = {
  rueckruf: { label: 'Rückruf', icon: PhoneCallIcon, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  kunde: { label: 'Kunde', icon: UsersIcon, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  intern: { label: 'Intern', icon: CalendarIcon, cls: 'bg-claimondo-bg text-claimondo-navy border-claimondo-border' },
  kb_beratung: { label: 'KB-Beratung', icon: CalendarIcon, cls: 'bg-claimondo-ondo/[0.06] text-claimondo-navy border-claimondo-ondo/30' },
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
    end_zeit: string | null
    status: string
    notizen: string | null
    lead_id: string | null
    fall_id: string | null
    lead: { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | { id: string; vorname: string | null; nachname: string | null; telefon: string | null }[] | null
    fall: { id: string; claim_nummer: string | null } | null
  }

  const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString()

  const [adminR, kbR] = await Promise.all([
    supabase
      .from('admin_termine')
      .select(
        'id, typ, titel, start_zeit, end_zeit, status, notizen, lead_id, fall_id, ' +
          'lead:leads!admin_termine_lead_id_fkey(id, vorname, nachname, telefon), ' +
          'fall:faelle!admin_termine_fall_id_fkey(id, claims:claim_id(claim_nummer))',
      )
      .eq('zugewiesen_an', user.id)
      .eq('status', 'offen')
      .gte('start_zeit', sinceIso)
      .order('start_zeit', { ascending: true }),
    // AAR-640: KB-Beratungen (gutachter_termine typ=kb_beratung, kb_id=user)
    supabase
      .from('gutachter_termine')
      .select(
        'id, start_zeit, end_zeit, status, fall_id, lead_id, kanal, notiz_intern, ' +
          'fall:faelle!gutachter_termine_fall_id_fkey(id, claims:claim_id(claim_nummer), lead_id)',
      )
      .eq('typ', 'kb_beratung')
      .eq('kb_id', user.id)
      .in('status', ['reserviert', 'bestaetigt'])
      .is('cancelled_at', null)
      .gte('start_zeit', sinceIso)
      .order('start_zeit', { ascending: true }),
  ])

  // CMM-44 SP-A3: claim_nummer aus dem nested claims-Embed auf das flache
  // TerminRow.fall normalisieren (Array|Objekt je nach Cardinality).
  type ClaimNrJoin = { claim_nummer: string | null } | { claim_nummer: string | null }[] | null
  const adminTermine: TerminRow[] = ((adminR.data ?? []) as unknown as Array<
    Omit<TerminRow, 'fall'> & {
      fall: { id: string; claims: ClaimNrJoin } | { id: string; claims: ClaimNrJoin }[] | null
    }
  >).map((t) => {
    const fallRaw = t.fall as unknown
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; claims: ClaimNrJoin } | null)
    const claim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    return { ...t, fall: fall ? { id: fall.id, claim_nummer: claim?.claim_nummer ?? null } : null }
  })
  type KbRow = {
    id: string
    start_zeit: string
    end_zeit: string | null
    status: string
    fall_id: string | null
    lead_id: string | null
    kanal: string | null
    notiz_intern: string | null
    fall: { id: string; claims: ClaimNrJoin; lead_id: string | null } | { id: string; claims: ClaimNrJoin; lead_id: string | null }[] | null
  }
  const kbTermineRaw = (kbR.data ?? []) as unknown as KbRow[]

  // Namen für KB-Leads laden (via fall.lead_id oder direkt kb.lead_id)
  const kbLeadIds = [
    ...new Set(
      kbTermineRaw
        .map(k => {
          const fallRaw = k.fall as unknown
          const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { lead_id: string | null } | null)
          return fall?.lead_id ?? k.lead_id
        })
        .filter(Boolean) as string[],
    ),
  ]
  const kbLeadNameMap: Record<string, string> = {}
  if (kbLeadIds.length > 0) {
    const { data: leads } = await supabase.from('leads').select('id, vorname, nachname').in('id', kbLeadIds)
    for (const l of leads ?? []) kbLeadNameMap[l.id] = [l.vorname, l.nachname].filter(Boolean).join(' ') || '—'
  }

  const kbAsTermine: TerminRow[] = kbTermineRaw.map(k => {
    const fallRaw = k.fall as unknown
    const fall = Array.isArray(fallRaw) ? fallRaw[0] ?? null : (fallRaw as { id: string; claims: ClaimNrJoin; lead_id: string | null } | null)
    const fallClaim = Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims
    const namesLeadId = fall?.lead_id ?? k.lead_id
    const kundenName = namesLeadId ? kbLeadNameMap[namesLeadId] : null
    return {
      id: k.id,
      typ: 'kb_beratung',
      titel: kundenName ? `KB-Beratung · ${kundenName}` : 'KB-Beratung',
      start_zeit: k.start_zeit,
      end_zeit: k.end_zeit,
      status: k.status,
      notizen: k.notiz_intern,
      lead_id: k.lead_id,
      fall_id: k.fall_id,
      lead: null,
      fall: fall ? { id: fall.id, claim_nummer: fallClaim?.claim_nummer ?? null } : null,
    }
  })

  const termine = [...adminTermine, ...kbAsTermine].sort(
    (a, b) => new Date(a.start_zeit).getTime() - new Date(b.start_zeit).getTime(),
  )

  const groups = new Map<string, TerminRow[]>()
  for (const t of termine) {
    const dayKey = new Date(t.start_zeit).toISOString().slice(0, 10)
    const bucket = groups.get(dayKey) ?? []
    bucket.push(t)
    groups.set(dayKey, bucket)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Meine Termine" description="Rückrufe und Kundentermine, die dir zugewiesen sind." size="lg" />

      {groups.size === 0 && (
        <div className="bg-white rounded-ios-lg shadow-ios-md px-6 py-16 text-center">
          <p className="text-sm text-claimondo-ondo/70">Keine offenen Termine</p>
        </div>
      )}

      {Array.from(groups.entries()).map(([day, rows]) => {
        const isToday = day === nowIso.slice(0, 10)
        return (
          <section key={day} className="bg-white rounded-ios-lg shadow-ios-md">
            <div className="px-4 py-3 border-b border-claimondo-border flex items-center justify-between">
              <h2 className="text-sm font-semibold text-claimondo-navy">
                {new Date(day + 'T00:00:00').toLocaleDateString('de-DE', {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                })}
                {isToday && <span className="ml-2 text-xs text-claimondo-ondo">(heute)</span>}
              </h2>
              <span className="text-xs text-claimondo-ondo">{rows?.length ?? 0}</span>
            </div>
            <div className="divide-y divide-claimondo-border">
              {(rows ?? []).map((t) => {
                const meta = TYP_META[t.typ] ?? TYP_META.intern
                const Icon = meta.icon
                const leadRaw = t.lead as unknown
                const lead = Array.isArray(leadRaw) ? leadRaw[0] ?? null : (leadRaw as { id: string; vorname: string | null; nachname: string | null; telefon: string | null } | null)
                const fall = t.fall
                const subject = lead
                  ? `${[lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Lead'}`
                  : fall?.claim_nummer ?? t.titel
                const href = lead ? `/dispatch/leads/${lead.id}` : fall ? `/faelle/${fall.id}` : '#'
                const overdue = new Date(t.start_zeit) < new Date()
                return (
                  <Link key={t.id} href={href} className="block px-4 py-3 hover:bg-claimondo-bg transition-colors">
                    <div className="flex items-center gap-3">
                      <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.cls}`}>
                        <Icon className="w-3 h-3" />
                        {meta.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-claimondo-navy truncate">{subject}</p>
                        <p className={`text-xs ${overdue ? 'text-red-600 font-medium' : 'text-claimondo-ondo'}`}>
                          {new Date(t.start_zeit).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                          {t.notizen && ` · ${t.notizen}`}
                          {overdue && ' (überfällig)'}
                        </p>
                      </div>
                      {lead?.telefon && (
                        <span className="text-xs text-claimondo-ondo/70 hidden sm:block">{lead.telefon}</span>
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
