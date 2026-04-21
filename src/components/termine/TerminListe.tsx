// AAR-638/641/643: Shared-UI für Termin-Listen im Objekt-Kontext.
// Server-Component — lädt via lib/termine/loader und rendert chronologisch.

import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { PhoneCallIcon, UsersIcon, CalendarIcon, HardHatIcon, VideoIcon } from 'lucide-react'
import { loadTermine, type NormalizedTermin } from '@/lib/termine/loader'

type Scope =
  | { fallId: string; leadId?: string; dispatchLinks?: boolean; emptyHint?: string }
  | { leadId: string; dispatchLinks?: boolean; emptyHint?: string }

const TYP_META: Record<
  NormalizedTermin['typ'],
  { label: string; icon: typeof PhoneCallIcon; cls: string }
> = {
  rueckruf: { label: 'Rückruf', icon: PhoneCallIcon, cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  kunde: { label: 'Kunde', icon: UsersIcon, cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  intern: { label: 'Intern', icon: CalendarIcon, cls: 'bg-gray-100 text-gray-700 border-gray-200' },
  gutachter: { label: 'Gutachter', icon: HardHatIcon, cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  kb_beratung: { label: 'KB-Beratung', icon: VideoIcon, cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}

const STATUS_CLS: Record<string, string> = {
  offen: 'text-gray-600',
  reserviert: 'text-amber-700',
  bestaetigt: 'text-emerald-700',
  gegenvorschlag: 'text-amber-700',
  erledigt: 'text-gray-400 line-through',
  abgelehnt: 'text-red-700 line-through',
  abgesagt: 'text-red-700 line-through',
}

export default async function TerminListe(props: Scope) {
  const supabase = await createClient()
  const termine = await loadTermine(supabase, props as Parameters<typeof loadTermine>[1])

  const now = new Date()
  const kommend = termine.filter(t => new Date(t.start) >= now)
  const vergangen = termine.filter(t => new Date(t.start) < now)

  if (termine.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 text-center">
        <CalendarIcon className="w-5 h-5 text-gray-300 mx-auto mb-2" />
        <p className="text-sm text-gray-400">
          {props.emptyHint ?? 'Keine Termine vorhanden'}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {kommend.length > 0 && (
        <Gruppe label="Kommend" rows={kommend} dispatchLinks={props.dispatchLinks} />
      )}
      {vergangen.length > 0 && (
        <Gruppe label="Vergangen" rows={vergangen} dispatchLinks={props.dispatchLinks} muted />
      )}
    </div>
  )
}

function Gruppe({
  label,
  rows,
  muted,
  dispatchLinks,
}: {
  label: string
  rows: NormalizedTermin[]
  muted?: boolean
  dispatchLinks?: boolean
}) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 ${muted ? 'opacity-80' : ''}`}>
      <div className="px-4 py-2 border-b border-gray-100 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{label}</h3>
        <span className="text-[10px] text-gray-400">{rows.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map(t => <Row key={`${t.quelle}-${t.id}`} t={t} dispatchLinks={dispatchLinks} />)}
      </div>
    </section>
  )
}

function Row({ t, dispatchLinks }: { t: NormalizedTermin; dispatchLinks?: boolean }) {
  const meta = TYP_META[t.typ]
  const Icon = meta.icon
  const start = new Date(t.start)
  const now = new Date()
  const isOverdue = t.status !== 'erledigt' && t.status !== 'abgesagt' && start < now && t.status !== 'abgelehnt'
  const linkHref = t.fallId
    ? `/faelle/${t.fallId}`
    : t.leadId
      ? (dispatchLinks ? `/dispatch/leads/${t.leadId}` : '#')
      : '#'
  const datumLabel = start.toLocaleString('de-DE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })

  return (
    <Link href={linkHref} className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
      <span className={`flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0 ${meta.cls}`}>
        <Icon className="w-3 h-3" />
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{t.titel}</p>
        <p className="text-xs text-gray-500 truncate">
          <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{datumLabel}</span>
          {t.verantwortlichName && ` · ${t.verantwortlichName}`}
          {t.kanal && ` · ${t.kanal === 'video' ? '📹' : '📞'}`}
          {t.notizen && ` · ${t.notizen}`}
        </p>
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap ${STATUS_CLS[t.status] ?? 'text-gray-500'}`}>
        {t.status}
      </span>
    </Link>
  )
}
