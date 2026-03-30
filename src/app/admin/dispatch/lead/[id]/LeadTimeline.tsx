'use client'

import {
  ClockIcon,
  PhoneCallIcon,
  CheckCircle2Icon,
  SendIcon,
  CalendarIcon,
  FileTextIcon,
  UserPlusIcon,
} from 'lucide-react'

type TimelineEntry = {
  id: string
  typ: string
  titel: string
  beschreibung: string | null
  created_at: string
}

type LeadInfo = {
  created_at: string | null
  qualifizierungs_phase: string
  rueckruf_datum: string | null
  rueckruf_erledigt: boolean
  sa_unterschrieben: boolean
  gutachter_termin: string | null
  wa_gesendet: boolean
}

const PHASE_LABELS: Record<string, string> = {
  neu: 'Neu',
  erstkontakt: 'Erstkontakt hergestellt',
  'schadentyp-erfasst': 'Schadentyp erfasst',
  'konstellation-erfasst': 'Kunden-Konstellation erfasst',
  'gegner-daten': 'Gegner-Daten erfasst',
  gutachtertermin: 'Gutachtertermin vereinbart',
  'sa-unterschrieben': 'SA + Vollmacht unterschrieben',
  'flow-gesendet': 'FlowLink versendet',
  abgeschlossen: 'Lead abgeschlossen / konvertiert',
}

export default function LeadTimeline({
  lead,
  timelineEntries,
}: {
  lead: LeadInfo
  timelineEntries: TimelineEntry[]
}) {
  // Build combined timeline from lead state + fall timeline entries
  const events: { icon: typeof ClockIcon; color: string; title: string; detail?: string; time: string }[] = []

  // Lead created
  if (lead.created_at) {
    events.push({
      icon: UserPlusIcon,
      color: 'text-sky-400',
      title: 'Lead erstellt',
      time: lead.created_at,
    })
  }

  // Current phase
  const phase = lead.qualifizierungs_phase
  if (phase && phase !== 'neu') {
    events.push({
      icon: CheckCircle2Icon,
      color: 'text-blue-400',
      title: `Phase: ${PHASE_LABELS[phase] ?? phase}`,
      time: lead.created_at ?? new Date().toISOString(), // approximation
    })
  }

  // Rueckruf
  if (lead.rueckruf_datum) {
    events.push({
      icon: PhoneCallIcon,
      color: lead.rueckruf_erledigt ? 'text-emerald-400' : 'text-amber-400',
      title: lead.rueckruf_erledigt ? 'Rueckruf durchgefuehrt' : 'Rueckruf geplant',
      detail: new Date(lead.rueckruf_datum).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
      time: lead.rueckruf_datum,
    })
  }

  // SA
  if (lead.sa_unterschrieben) {
    events.push({
      icon: FileTextIcon,
      color: 'text-emerald-400',
      title: 'SA + Vollmacht erhalten',
      time: lead.created_at ?? new Date().toISOString(),
    })
  }

  // Gutachter-Termin
  if (lead.gutachter_termin) {
    events.push({
      icon: CalendarIcon,
      color: 'text-teal-400',
      title: 'Gutachter-Termin bestaetigt',
      detail: new Date(lead.gutachter_termin).toLocaleString('de-DE', {
        weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
      }),
      time: lead.gutachter_termin,
    })
  }

  // FlowLink
  if (lead.wa_gesendet) {
    events.push({
      icon: SendIcon,
      color: 'text-violet-400',
      title: 'FlowLink per WhatsApp gesendet',
      time: lead.created_at ?? new Date().toISOString(),
    })
  }

  // Fall timeline entries
  for (const entry of timelineEntries) {
    events.push({
      icon: ClockIcon,
      color: 'text-gray-500',
      title: entry.titel,
      detail: entry.beschreibung ?? undefined,
      time: entry.created_at,
    })
  }

  // Sort by time descending (newest first)
  events.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())

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
              {/* Line */}
              {i < events.length - 1 && (
                <div className="absolute left-[13px] top-7 bottom-0 w-px bg-gray-100" />
              )}
              {/* Icon */}
              <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center shrink-0 z-10">
                <Icon className={`w-3.5 h-3.5 ${ev.color}`} />
              </div>
              {/* Content */}
              <div className="pb-4 min-w-0">
                <p className="text-sm text-gray-800">{ev.title}</p>
                {ev.detail && <p className="text-xs text-gray-500 mt-0.5">{ev.detail}</p>}
                <p className="text-[10px] text-gray-400 mt-0.5">
                  {new Date(ev.time).toLocaleString('de-DE', {
                    day: '2-digit', month: '2-digit', year: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                  })}
                </p>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
