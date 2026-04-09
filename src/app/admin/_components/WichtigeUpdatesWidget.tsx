import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import {
  UserPlusIcon,
  FileSignatureIcon,
  CreditCardIcon,
  FolderPlusIcon,
  CheckCircle2Icon,
  ActivityIcon,
} from 'lucide-react'

// KFZ-155: Wichtige Updates Widget — Live-Feed der letzten 48h.
//
// Events:
//   - Neue SV-Anmeldungen (sachverstaendige.created_at)
//   - Vertrags-Unterzeichnungen (vertrag_unterschrieben_am)
//   - Erfolgreiche Anzahlungen (stripe_anzahlung_bezahlt_am)
//   - Neue Faelle (faelle.created_at)
//   - Abgeschlossene Faelle (faelle.regulierung_am)
//
// Maximal 10 Eintraege, sortiert nach Zeitstempel absteigend.

type EventType = 'sv_neu' | 'vertrag_signiert' | 'anzahlung_eingegangen' | 'fall_neu' | 'fall_abgeschlossen'

type Event = {
  key: string
  type: EventType
  text: string
  href: string | null
  ts: string
}

const EVENT_META: Record<EventType, { icon: typeof UserPlusIcon; bg: string; iconColor: string; label: string }> = {
  sv_neu: { icon: UserPlusIcon, bg: 'bg-[#4573A2]/10', iconColor: 'text-[#4573A2]', label: 'Neuer SV' },
  vertrag_signiert: { icon: FileSignatureIcon, bg: 'bg-purple-50', iconColor: 'text-purple-600', label: 'Vertrag' },
  anzahlung_eingegangen: { icon: CreditCardIcon, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Anzahlung' },
  fall_neu: { icon: FolderPlusIcon, bg: 'bg-amber-50', iconColor: 'text-amber-600', label: 'Neuer Fall' },
  fall_abgeschlossen: { icon: CheckCircle2Icon, bg: 'bg-emerald-50', iconColor: 'text-emerald-600', label: 'Abgeschlossen' },
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return 'gerade eben'
  if (minutes < 60) return `vor ${minutes} Min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `vor ${hours} Std`
  const days = Math.floor(hours / 24)
  return `vor ${days} ${days === 1 ? 'Tag' : 'Tagen'}`
}

async function loadEvents(): Promise<Event[]> {
  const supabase = await createClient()
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const events: Event[] = []

  // 1. Neue SVs (created_at)
  const { data: neueSvs } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)

  // 2. Vertrags-Unterzeichnungen
  const { data: vertraege } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, vertrag_unterschrieben_am')
    .eq('vertrag_unterschrieben', true)
    .gte('vertrag_unterschrieben_am', since)
    .order('vertrag_unterschrieben_am', { ascending: false })
    .limit(15)

  // 3. Erfolgreiche Anzahlungen (Stripe Webhook setzt das Feld)
  const { data: anzahlungen } = await supabase
    .from('sachverstaendige')
    .select('id, profile_id, stripe_anzahlung_bezahlt_am')
    .not('stripe_anzahlung_bezahlt_am', 'is', null)
    .gte('stripe_anzahlung_bezahlt_am', since)
    .order('stripe_anzahlung_bezahlt_am', { ascending: false })
    .limit(15)

  // SV-Profile fuer die Namen aller obigen Quellen
  const allProfileIds = new Set<string>()
  for (const arr of [neueSvs ?? [], vertraege ?? [], anzahlungen ?? []]) {
    for (const r of arr) {
      if (r.profile_id) allProfileIds.add(r.profile_id)
    }
  }
  let profileMap = new Map<string, { vorname: string | null; nachname: string | null }>()
  if (allProfileIds.size) {
    const { data: profs } = await supabase
      .from('profiles')
      .select('id, vorname, nachname')
      .in('id', Array.from(allProfileIds))
    profileMap = new Map((profs ?? []).map(p => [p.id, p]))
  }

  function svName(profileId: string | null): string {
    if (!profileId) return 'Unbekannt'
    const p = profileMap.get(profileId)
    if (!p) return 'Unbekannt'
    return `${p.vorname ?? ''} ${p.nachname ?? ''}`.trim() || 'Unbekannt'
  }

  for (const r of neueSvs ?? []) {
    events.push({
      key: `svneu-${r.id}`,
      type: 'sv_neu',
      text: `${svName(r.profile_id)} wurde als SV angelegt`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.created_at,
    })
  }
  for (const r of vertraege ?? []) {
    events.push({
      key: `vert-${r.id}`,
      type: 'vertrag_signiert',
      text: `${svName(r.profile_id)} hat den Vertrag unterzeichnet`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.vertrag_unterschrieben_am,
    })
  }
  for (const r of anzahlungen ?? []) {
    events.push({
      key: `anz-${r.id}`,
      type: 'anzahlung_eingegangen',
      text: `${svName(r.profile_id)} hat die Anzahlung geleistet`,
      href: `/admin/sachverstaendige/${r.id}`,
      ts: r.stripe_anzahlung_bezahlt_am,
    })
  }

  // 4. Neue Faelle
  const { data: neueFaelle } = await supabase
    .from('faelle')
    .select('id, fall_nummer, created_at')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(15)
  for (const f of neueFaelle ?? []) {
    events.push({
      key: `fall-${f.id}`,
      type: 'fall_neu',
      text: `Neuer Fall ${f.fall_nummer ?? ''}`.trim(),
      href: `/admin/faelle/${f.id}`,
      ts: f.created_at,
    })
  }

  // 5. Abgeschlossene Faelle
  const { data: abgeschlossen } = await supabase
    .from('faelle')
    .select('id, fall_nummer, regulierung_am, regulierung_betrag')
    .eq('status', 'abgeschlossen')
    .not('regulierung_am', 'is', null)
    .gte('regulierung_am', since)
    .order('regulierung_am', { ascending: false })
    .limit(15)
  for (const f of abgeschlossen ?? []) {
    const betrag = Number(f.regulierung_betrag ?? 0)
    const betragStr = betrag > 0 ? ` (${betrag.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })})` : ''
    events.push({
      key: `abg-${f.id}`,
      type: 'fall_abgeschlossen',
      text: `Fall ${f.fall_nummer ?? ''} abgeschlossen${betragStr}`,
      href: `/admin/faelle/${f.id}`,
      ts: f.regulierung_am,
    })
  }

  events.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime())
  return events.slice(0, 10)
}

export default async function WichtigeUpdatesWidget() {
  const events = await loadEvents()

  return (
    <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden flex flex-col h-full">
      <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ActivityIcon className="w-4 h-4 text-[#4573A2]" />
          <h2 className="text-sm font-semibold text-gray-700">Wichtige Updates</h2>
        </div>
        <span className="text-[10px] text-gray-500">letzte 48h</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {events.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-xs text-gray-500">Keine Aktivitaet in den letzten 48 Stunden.</p>
          </div>
        ) : (
          <ol className="divide-y divide-gray-100">
            {events.map(e => {
              const meta = EVENT_META[e.type]
              const Icon = meta.icon
              const content = (
                <div className="flex items-start gap-3 px-5 py-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-7 h-7 rounded-full ${meta.bg} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${meta.iconColor}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-gray-800 leading-snug truncate">{e.text}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{timeAgo(e.ts)}</p>
                  </div>
                </div>
              )
              return (
                <li key={e.key}>
                  {e.href ? <Link href={e.href}>{content}</Link> : content}
                </li>
              )
            })}
          </ol>
        )}
      </div>
    </div>
  )
}
