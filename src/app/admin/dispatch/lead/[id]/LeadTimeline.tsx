'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ClockIcon,
  PhoneCallIcon,
  CheckCircle2Icon,
  SendIcon,
  CalendarIcon,
  FileTextIcon,
  UserPlusIcon,
  PencilIcon,
  RefreshCwIcon,
} from 'lucide-react'

type TimelineEntry = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  created_at: string
}

type HistorieEntry = {
  id: string
  feld: string
  alter_wert: string | null
  neuer_wert: string | null
  geaendert_am: string
}

type LeadInfo = {
  id: string
  created_at: string | null
  qualifizierungs_phase: string
}

const FELD_LABELS: Record<string, string> = {
  vorname: 'Vorname', nachname: 'Nachname', email: 'E-Mail', telefon: 'Telefon',
  status: 'Status', qualifizierungs_phase: 'Phase', schadenfall_typ: 'Schadenfall-Typ',
  kunden_konstellation: 'Konstellation', source_channel: 'Quelle',
  personenschaden_flag: 'Personenschaden', mietwagen_flag: 'Mietwagen', leasing_flag: 'Leasing',
  gegner_name: 'Gegner', gegner_versicherung: 'Gegner-Vers.', gegner_kennzeichen: 'Gegner-Kennz.',
  sa_unterschrieben: 'SA', vollmacht_unterschrieben: 'Vollmacht',
  gutachter_termin: 'SV-Termin', rueckruf_datum: 'Rückruf',
  rueckruf_erledigt: 'RR erledigt', wa_gesendet: 'WA gesendet',
  notiz: 'Notiz', unfallhergang: 'Unfallhergang', mandatstyp: 'Mandatstyp',
}

function formatVal(val: string | null): string {
  if (val === null || val === '') return '—'
  if (val === 'true') return 'Ja'
  if (val === 'false') return 'Nein'
  return val
}

// Map feld changes to icons
function getIcon(feld: string) {
  if (feld === 'qualifizierungs_phase' || feld === 'status') return { icon: RefreshCwIcon, color: 'text-[#4573A2]' }
  if (feld === 'rueckruf_datum' || feld === 'rueckruf_erledigt') return { icon: PhoneCallIcon, color: 'text-amber-500' }
  if (feld === 'sa_unterschrieben' || feld === 'vollmacht_unterschrieben') return { icon: FileTextIcon, color: 'text-emerald-500' }
  if (feld === 'gutachter_termin') return { icon: CalendarIcon, color: 'text-teal-500' }
  if (feld === 'wa_gesendet') return { icon: SendIcon, color: 'text-violet-500' }
  return { icon: PencilIcon, color: 'text-gray-400' }
}

export default function LeadTimeline({
  lead,
  timelineEntries,
}: {
  lead: LeadInfo
  timelineEntries: TimelineEntry[]
}) {
  const [historieEvents, setHistorieEvents] = useState<HistorieEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase
      .from('lead_historie')
      .select('id, feld, alter_wert, neuer_wert, geaendert_am')
      .eq('lead_id', lead.id)
      .order('geaendert_am', { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setHistorieEvents(data ?? [])
        setLoading(false)
      })
  }, [lead.id])

  // Build combined timeline: lead_historie + fall timeline entries + lead creation
  type Event = { icon: typeof ClockIcon; color: string; title: string; detail?: string; time: string }
  const events: Event[] = []

  // Lead created
  if (lead.created_at) {
    events.push({ icon: UserPlusIcon, color: 'text-sky-500', title: 'Lead erstellt', time: lead.created_at })
  }

  // lead_historie entries (from DB trigger)
  for (const h of historieEvents) {
    const { icon, color } = getIcon(h.feld)
    const label = FELD_LABELS[h.feld] ?? h.feld
    events.push({
      icon, color,
      title: `${label} geaendert`,
      detail: `${formatVal(h.alter_wert)} → ${formatVal(h.neuer_wert)}`,
      time: h.geaendert_am,
    })
  }

  // Fall timeline entries
  for (const entry of timelineEntries) {
    events.push({
      icon: ClockIcon, color: 'text-gray-500',
      title: entry.titel,
      detail: entry.beschreibung ?? undefined,
      time: entry.created_at,
    })
  }

  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

  if (loading) {
    return (
      <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
        <div className="flex items-center gap-2 mb-4">
          <ClockIcon className="w-4 h-4 text-gray-500" />
          <h2 className="text-sm font-medium text-gray-500">Timeline</h2>
        </div>
        <div className="flex justify-center py-4">
          <div className="w-4 h-4 border-2 border-gray-300 border-t-[#4573A2] rounded-full animate-spin" />
        </div>
      </div>
    )
  }

  if (events.length === 0) return null

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <ClockIcon className="w-4 h-4 text-gray-500" />
        <h2 className="text-sm font-medium text-gray-500">Timeline ({events.length})</h2>
      </div>

      <div className="space-y-0">
        {events.map((ev, i) => {
          const Icon = ev.icon
          return (
            <div key={i} className="flex gap-3 relative">
              {i < events.length - 1 && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-100" />
              )}
              <div className="w-7 h-7 rounded-full bg-gray-50 flex items-center justify-center shrink-0 z-10">
                <Icon className={`w-3.5 h-3.5 ${ev.color}`} />
              </div>
              <div className="pb-4 min-w-0">
                <p className="text-sm text-gray-800">{ev.title}</p>
                {ev.detail && <p className="text-xs text-gray-500 mt-0.5 truncate">{ev.detail}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(ev.time).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
