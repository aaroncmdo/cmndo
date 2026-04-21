'use client'

// AAR-638/641/643: Client-Variant der Termin-Liste. Lädt die Termine nach
// Mount via Browser-Client (Supabase). Pattern parallel zu FallRueckrufSection
// damit die Komponente in Client-Shells (FallakteShell, DispatchShell) ohne
// Prop-Drilling eingebunden werden kann.

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import { PhoneCallIcon, UsersIcon, CalendarIcon, HardHatIcon, VideoIcon } from 'lucide-react'

export type TerminTyp = 'rueckruf' | 'kunde' | 'intern' | 'gutachter' | 'kb_beratung'
type TerminQuelle = 'admin_termine' | 'gutachter_termine'
type Normalized = {
  id: string
  quelle: TerminQuelle
  typ: TerminTyp
  titel: string
  start: string
  status: string
  notizen: string | null
  fallId: string | null
  leadId: string | null
  verantwortlich: string | null
  kanal: string | null
}

const TYP_META: Record<TerminTyp, { label: string; icon: typeof PhoneCallIcon; cls: string }> = {
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

export default function TerminListeClient({
  fallId,
  leadId,
  dispatchLinks,
  variant = 'full',
  title = 'Termine',
  limit,
}: {
  fallId?: string
  leadId?: string
  dispatchLinks?: boolean
  variant?: 'full' | 'compact'
  title?: string
  limit?: number
}) {
  const [rows, setRows] = useState<Normalized[] | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createBrowserClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      )
      const out: Normalized[] = []

      // admin_termine
      {
        let q = supabase
          .from('admin_termine')
          .select('id, typ, titel, start_zeit, status, notizen, fall_id, lead_id, zugewiesen_an')
        if (fallId && leadId) q = q.or(`fall_id.eq.${fallId},lead_id.eq.${leadId}`)
        else if (fallId) q = q.eq('fall_id', fallId)
        else if (leadId) q = q.eq('lead_id', leadId)
        const { data } = await q.order('start_zeit', { ascending: false })
        for (const r of data ?? []) {
          out.push({
            id: r.id,
            quelle: 'admin_termine',
            typ: r.typ as TerminTyp,
            titel: r.titel,
            start: r.start_zeit,
            status: r.status,
            notizen: r.notizen,
            fallId: r.fall_id,
            leadId: r.lead_id,
            verantwortlich: null,
            kanal: null,
          })
        }
      }
      // gutachter_termine
      {
        let q = supabase
          .from('gutachter_termine')
          .select('id, typ, start_zeit, status, fall_id, lead_id, sv_id, kb_id, kanal, notiz_intern')
          .is('cancelled_at', null)
        if (fallId && leadId) q = q.or(`fall_id.eq.${fallId},lead_id.eq.${leadId}`)
        else if (fallId) q = q.eq('fall_id', fallId)
        else if (leadId) q = q.eq('lead_id', leadId)
        const { data } = await q.order('start_zeit', { ascending: false })
        for (const r of data ?? []) {
          const isKb = r.typ === 'kb_beratung'
          out.push({
            id: r.id,
            quelle: 'gutachter_termine',
            typ: isKb ? 'kb_beratung' : 'gutachter',
            titel: isKb ? 'KB-Beratung' : 'Gutachter-Termin',
            start: r.start_zeit,
            status: r.status,
            notizen: r.notiz_intern,
            fallId: r.fall_id,
            leadId: r.lead_id,
            verantwortlich: null,
            kanal: r.kanal,
          })
        }
      }

      out.sort((a, b) => new Date(b.start).getTime() - new Date(a.start).getTime())
      if (!cancelled) setRows(limit ? out.slice(0, limit) : out)
    }
    void load()
    return () => { cancelled = true }
  }, [fallId, leadId, limit])

  if (rows === null) {
    return <div className="bg-white rounded-xl border border-gray-200 p-4 text-xs text-gray-400">Lade Termine…</div>
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-xs text-gray-400">
        Keine Termine vorhanden
      </div>
    )
  }

  const now = new Date()
  const kommend = rows.filter(r => new Date(r.start) >= now)
  const vergangen = rows.filter(r => new Date(r.start) < now)

  return (
    <div className="space-y-3">
      {variant === 'full' && (
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">{title}</h3>
      )}
      {kommend.length > 0 && (
        <Gruppe label="Kommend" rows={kommend} dispatchLinks={dispatchLinks} />
      )}
      {vergangen.length > 0 && (
        <Gruppe label="Vergangen" rows={vergangen} dispatchLinks={dispatchLinks} muted />
      )}
    </div>
  )
}

function Gruppe({ label, rows, muted, dispatchLinks }: { label: string; rows: Normalized[]; muted?: boolean; dispatchLinks?: boolean }) {
  return (
    <section className={`bg-white rounded-xl border border-gray-200 ${muted ? 'opacity-80' : ''}`}>
      <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">{label}</h4>
        <span className="text-[10px] text-gray-400">{rows.length}</span>
      </div>
      <div className="divide-y divide-gray-50">
        {rows.map(r => <Row key={`${r.quelle}-${r.id}`} r={r} dispatchLinks={dispatchLinks} />)}
      </div>
    </section>
  )
}

function Row({ r, dispatchLinks }: { r: Normalized; dispatchLinks?: boolean }) {
  const meta = TYP_META[r.typ] ?? TYP_META.intern
  const Icon = meta.icon
  const start = new Date(r.start)
  const now = new Date()
  const isOverdue = r.status !== 'erledigt' && r.status !== 'abgesagt' && r.status !== 'abgelehnt' && start < now
  const href = r.fallId
    ? `/faelle/${r.fallId}`
    : r.leadId
      ? (dispatchLinks ? `/dispatch/leads/${r.leadId}` : '#')
      : '#'
  const datum = start.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 transition-colors">
      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${meta.cls}`}>
        <Icon className="w-3 h-3" />
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-gray-800 truncate">{r.titel}</p>
        <p className="text-[10px] text-gray-500 truncate">
          <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{datum}</span>
          {r.kanal && ` · ${r.kanal === 'video' ? '📹' : '📞'}`}
          {r.notizen && ` · ${r.notizen}`}
        </p>
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap ${STATUS_CLS[r.status] ?? 'text-gray-500'}`}>
        {r.status}
      </span>
    </Link>
  )
}
