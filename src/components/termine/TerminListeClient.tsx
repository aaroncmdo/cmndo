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
  intern: { label: 'Intern', icon: CalendarIcon, cls: 'bg-claimondo-bg text-claimondo-navy border-claimondo-border' },
  gutachter: { label: 'Gutachter', icon: HardHatIcon, cls: 'bg-claimondo-bg text-claimondo-ondo border-claimondo-border' },
  kb_beratung: { label: 'KB-Beratung', icon: VideoIcon, cls: 'bg-violet-50 text-violet-700 border-violet-200' },
}

const STATUS_CLS: Record<string, string> = {
  offen: 'text-claimondo-ondo',
  reserviert: 'text-amber-700',
  bestaetigt: 'text-emerald-700',
  gegenvorschlag: 'text-amber-700',
  erledigt: 'text-claimondo-ondo/70 line-through',
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
  onRueckrufClick,
}: {
  fallId?: string
  leadId?: string
  dispatchLinks?: boolean
  variant?: 'full' | 'compact'
  title?: string
  limit?: number
  /** Wenn gesetzt: Rückruf-Zeilen öffnen diesen Handler statt zu navigieren. */
  onRueckrufClick?: (leadId: string) => void
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
    return <div className="bg-white rounded-xl border border-claimondo-border p-4 text-xs text-claimondo-ondo/70">Lade Termine…</div>
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-claimondo-border p-4 text-center text-xs text-claimondo-ondo/70">
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
        <h3 className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo">{title}</h3>
      )}
      {kommend.length > 0 && (
        <Gruppe label="Kommend" rows={kommend} dispatchLinks={dispatchLinks} onRueckrufClick={onRueckrufClick} />
      )}
      {vergangen.length > 0 && (
        <Gruppe label="Vergangen" rows={vergangen} dispatchLinks={dispatchLinks} muted onRueckrufClick={onRueckrufClick} />
      )}
    </div>
  )
}

function Gruppe({ label, rows, muted, dispatchLinks, onRueckrufClick }: { label: string; rows: Normalized[]; muted?: boolean; dispatchLinks?: boolean; onRueckrufClick?: (leadId: string) => void }) {
  return (
    <section className={`bg-white rounded-xl border border-claimondo-border ${muted ? 'opacity-80' : ''}`}>
      <div className="px-3 py-2 border-b border-claimondo-border flex items-center justify-between">
        <h4 className="text-[10px] font-semibold text-claimondo-ondo uppercase tracking-wide">{label}</h4>
        <span className="text-[10px] text-claimondo-ondo/70">{rows.length}</span>
      </div>
      <div className="divide-y divide-claimondo-border">
        {rows.map(r => <Row key={`${r.quelle}-${r.id}`} r={r} dispatchLinks={dispatchLinks} onRueckrufClick={onRueckrufClick} />)}
      </div>
    </section>
  )
}

function Row({ r, dispatchLinks, onRueckrufClick }: { r: Normalized; dispatchLinks?: boolean; onRueckrufClick?: (leadId: string) => void }) {
  const meta = TYP_META[r.typ] ?? TYP_META.intern
  const Icon = meta.icon
  const start = new Date(r.start)
  const now = new Date()
  const isOverdue = r.status !== 'erledigt' && r.status !== 'abgesagt' && r.status !== 'abgelehnt' && start < now
  const datum = start.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

  const inner = (
    <>
      <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0 ${meta.cls}`}>
        <Icon className="w-3 h-3" />
        {meta.label}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-claimondo-navy truncate">{r.titel}</p>
        <p className="text-[10px] text-claimondo-ondo truncate">
          <span className={isOverdue ? 'text-red-600 font-medium' : ''}>{datum}</span>
          {r.kanal && ` · ${r.kanal === 'video' ? '📹' : '📞'}`}
          {r.notizen && ` · ${r.notizen}`}
        </p>
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap ${STATUS_CLS[r.status] ?? 'text-claimondo-ondo'}`}>
        {r.status}
      </span>
    </>
  )

  // Rückruf-Zeile: Handler öffnet Panel statt Navigation
  if (r.typ === 'rueckruf' && onRueckrufClick && r.leadId) {
    return (
      <button
        type="button"
        onClick={() => onRueckrufClick(r.leadId!)}
        className="w-full flex items-center gap-2 px-3 py-2 hover:bg-claimondo-bg transition-colors text-left"
      >
        {inner}
      </button>
    )
  }

  const href = r.fallId
    ? `/faelle/${r.fallId}`
    : r.leadId
      ? (dispatchLinks ? `/dispatch/leads/${r.leadId}` : '#')
      : '#'

  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 hover:bg-claimondo-bg transition-colors">
      {inner}
    </Link>
  )
}
