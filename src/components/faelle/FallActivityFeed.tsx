'use client'

import { useState, useEffect, useMemo } from 'react'
import {
  ArrowRightIcon, MessageSquareIcon, FileTextIcon, CalendarIcon, AlertTriangleIcon,
  CheckCircleIcon, PhoneIcon, MailIcon, UploadIcon, ClockIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// KFZ-172: Activity-Feed fuer die Fall-Akte Right-Sidebar.
// Zeigt die letzten Events des Falls aus timeline + tasks + nachrichten.

export type ActivityEvent = {
  id: string
  typ: 'status' | 'kommunikation' | 'dokument' | 'task' | 'termin' | 'eskalation' | 'notiz'
  titel: string
  beschreibung?: string | null
  erstellt_von?: string | null
  created_at: string
  from_lead?: boolean
}

const TYPE_CONFIG: Record<string, { icon: typeof ArrowRightIcon; color: string }> = {
  status: { icon: ArrowRightIcon, color: 'text-claimondo-ondo' },
  kommunikation: { icon: MessageSquareIcon, color: 'text-claimondo-ondo' },
  dokument: { icon: FileTextIcon, color: 'text-emerald-500' },
  task: { icon: CheckCircleIcon, color: 'text-amber-500' },
  termin: { icon: CalendarIcon, color: 'text-purple-500' },
  eskalation: { icon: AlertTriangleIcon, color: 'text-red-500' },
  notiz: { icon: ClockIcon, color: 'text-claimondo-ondo/70' },
}

function formatRelativ(dateStr: string): string {
  const now = Date.now()
  const d = new Date(dateStr).getTime()
  const diff = now - d
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'gerade eben'
  if (mins < 60) return `vor ${mins} Min`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `vor ${hours} Std`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'gestern'
  if (days < 7) return `vor ${days} Tagen`
  return new Date(dateStr).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit' })
}

export default function FallActivityFeed({
  fallId,
  events,
  maxItems = 15,
}: {
  fallId?: string
  events: ActivityEvent[]
  maxItems?: number
}) {
  const [liveEvents, setLiveEvents] = useState<ActivityEvent[]>(events)
  const supabase = useMemo(() => createClient(), [])

  // Sync props -> state
  useEffect(() => { setLiveEvents(events) }, [events])

  // Realtime: neue Timeline-Eintraege live empfangen
  useEffect(() => {
    if (!fallId) return
    const channel = supabase
      .channel(`fall-activity-${fallId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'timeline', filter: `fall_id=eq.${fallId}` },
        (payload) => {
          const row = payload.new as { id: string; typ: string; titel: string; beschreibung?: string | null; erstellt_von?: string | null; created_at: string }
          const ev: ActivityEvent = {
            id: `tl-live-${row.id}`,
            typ: row.typ === 'eskalation' ? 'eskalation' : row.typ === 'status' ? 'status' : row.typ === 'dokument' ? 'dokument' : 'notiz',
            titel: row.titel,
            beschreibung: row.beschreibung,
            erstellt_von: row.erstellt_von,
            created_at: row.created_at,
          }
          setLiveEvents(prev => [ev, ...prev].slice(0, 30))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fallId, supabase])

  const sorted = [...liveEvents]
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, maxItems)

  return (
    <div className="bg-white rounded-xl border border-claimondo-border p-3">
      <h3 className="text-[10px] font-semibold text-claimondo-ondo/70 uppercase tracking-wider mb-2">
        Letzte Aktivitäten
      </h3>
      {sorted.length === 0 ? (
        <p className="text-xs text-claimondo-ondo/70">Noch keine Aktivitäten.</p>
      ) : (
        <div className="space-y-0.5">
          {sorted.map(ev => {
            const cfg = TYPE_CONFIG[ev.typ] ?? TYPE_CONFIG.notiz
            const Icon = cfg.icon
            return (
              <div key={ev.id} className="flex items-start gap-2 px-1 py-1.5 rounded-md hover:bg-claimondo-bg/50">
                <Icon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <p className="text-[11px] text-claimondo-navy leading-snug truncate">{ev.titel}</p>
                    {ev.from_lead && (
                      <span className="flex-shrink-0 text-[8px] font-medium text-claimondo-ondo/70 bg-claimondo-bg px-1 py-0.5 rounded">
                        Aus Lead
                      </span>
                    )}
                  </div>
                  <p className="text-[9px] text-claimondo-ondo/70 mt-0.5">
                    {formatRelativ(ev.created_at)}
                    {ev.erstellt_von && <span> · {ev.erstellt_von}</span>}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Helper: baut ActivityEvents aus den existing Fall-Daten zusammen.
 * Wird in der Server-Page oder im Client aufgerufen.
 */
export function buildActivityEvents(
  timeline: { id: string; typ: string; titel: string; beschreibung?: string | null; erstellt_von?: string | null; lead_id?: string | null; created_at: string }[],
  tasks: { id: string; titel: string; status: string; lead_id?: string | null; created_at: string }[],
  nachrichten: { id: string; kanal: string; sender_rolle?: string | null; nachricht: string; lead_id?: string | null; created_at: string }[],
): ActivityEvent[] {
  const events: ActivityEvent[] = []

  for (const t of timeline) {
    events.push({
      id: `tl-${t.id}`,
      typ: t.typ === 'eskalation' ? 'eskalation'
        : t.typ === 'status' || t.typ === 'status_wechsel' ? 'status'
        : t.typ === 'dokument' ? 'dokument'
        : t.typ === 'termin' ? 'termin'
        : 'notiz',
      titel: t.titel,
      beschreibung: t.beschreibung,
      erstellt_von: t.erstellt_von,
      created_at: t.created_at,
      from_lead: !!t.lead_id,
    })
  }

  for (const t of tasks) {
    events.push({
      id: `task-${t.id}`,
      typ: 'task',
      titel: `Task: ${t.titel}${t.status === 'erledigt' ? ' ✓' : ''}`,
      created_at: t.created_at,
      from_lead: !!t.lead_id,
    })
  }

  for (const n of nachrichten.slice(-10)) {
    events.push({
      id: `msg-${n.id}`,
      typ: 'kommunikation',
      titel: `${n.kanal === 'whatsapp' ? 'WhatsApp' : n.kanal === 'email' ? 'E-Mail' : n.kanal === 'anruf' ? 'Anruf' : n.kanal}: ${n.nachricht.slice(0, 60)}${n.nachricht.length > 60 ? '…' : ''}`,
      erstellt_von: n.sender_rolle,
      created_at: n.created_at,
      from_lead: !!n.lead_id,
    })
  }

  return events
}
