'use client'

import { useState, useEffect } from 'react'
import { PhoneIcon, MailIcon, MessageSquareIcon, InfoIcon, ChevronDownIcon, PlayCircleIcon, SendIcon } from 'lucide-react'
import type { TimelineItem } from '@/lib/fall/communication-timeline'

const TYPE_CONFIG: Record<string, { icon: typeof PhoneIcon; color: string; label: string }> = {
  call: { icon: PhoneIcon, color: '#4573A2', label: 'Anruf' },
  email: { icon: MailIcon, color: '#E89B3C', label: 'Email' },
  chat: { icon: MessageSquareIcon, color: '#5DAA80', label: 'Chat' },
  system: { icon: InfoIcon, color: '#7B7B8A', label: 'System' },
}

export default function CommunicationTimeline({
  fallId,
  initialItems,
  onCompose,
}: {
  fallId: string
  initialItems: TimelineItem[]
  onCompose?: () => void
}) {
  const [items, setItems] = useState(initialItems)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(['call', 'email', 'chat', 'system']))
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filtered = items.filter(i => typeFilter.has(i.sourceType))

  function toggleType(t: string) {
    setTypeFilter(prev => {
      const next = new Set(prev)
      if (next.has(t)) next.delete(t); else next.add(t)
      return next
    })
  }

  return (
    <div>
      {/* Filter-Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex gap-1.5">
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => {
            const active = typeFilter.has(key)
            const Icon = cfg.icon
            return (
              <button key={key} onClick={() => toggleType(key)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
                  active ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-500'
                }`}
                style={active ? { backgroundColor: cfg.color } : {}}>
                <Icon className="w-3 h-3" /> {cfg.label}
              </button>
            )
          })}
        </div>
        {onCompose && (
          <button onClick={onCompose}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#4573A2] text-white text-xs font-medium rounded-lg hover:bg-[#1E3A5F] transition-colors">
            <SendIcon className="w-3.5 h-3.5" /> Email senden
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="space-y-0">
        {filtered.length === 0 && (
          <p className="text-center text-gray-400 text-sm py-8">Keine Kommunikation vorhanden.</p>
        )}
        {filtered.map((item, idx) => {
          const cfg = TYPE_CONFIG[item.sourceType] ?? TYPE_CONFIG.system
          const Icon = cfg.icon
          const isExpanded = expandedId === item.id
          const isLast = idx === filtered.length - 1

          return (
            <div key={item.id} className="flex">
              {/* Timeline-Linie */}
              <div className="flex flex-col items-center mr-3 w-6">
                <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: cfg.color + '15' }}>
                  <Icon className="w-3 h-3" style={{ color: cfg.color }} />
                </div>
                {!isLast && <div className="w-0.5 flex-1 min-h-3 bg-gray-200" />}
              </div>

              {/* Content */}
              <div className="flex-1 pb-3">
                <button
                  onClick={() => setExpandedId(isExpanded ? null : item.id)}
                  className="w-full text-left group"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-800">
                          {item.richtung === 'outbound' ? '→' : item.richtung === 'inbound' ? '←' : '•'}{' '}
                          {item.initiatorName}
                          {item.empfaengerName && item.richtung !== 'system' && ` → ${item.empfaengerName}`}
                        </span>
                        {item.bridgeTyp && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">Bridge</span>
                        )}
                        {item.dauer != null && (
                          <span className="text-[10px] text-gray-400">{Math.floor(item.dauer / 60)}:{String(item.dauer % 60).padStart(2, '0')}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.preview}</p>
                    </div>
                    <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                      <span className="text-[10px] text-gray-400">
                        {item.zeitpunkt ? new Date(item.zeitpunkt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {(item.sourceType === 'call' || item.sourceType === 'email') && (
                        <ChevronDownIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </div>
                </button>

                {/* Expanded Content */}
                {isExpanded && (
                  <div className="mt-2 bg-gray-50 rounded-xl p-4 border border-gray-200">
                    {item.sourceType === 'call' && (
                      <div className="space-y-3">
                        {item.kiZusammenfassung && (
                          <div>
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">KI-Zusammenfassung</p>
                            <p className="text-xs text-gray-700">{item.kiZusammenfassung}</p>
                          </div>
                        )}
                        {item.hatTranskript && (
                          <p className="text-xs text-[#4573A2]">Transkript verfügbar — Klicke auf den Anruf in der Fallakte für die vollständige Ansicht.</p>
                        )}
                        {item.hatRecording && (
                          <div className="flex items-center gap-2 text-xs text-gray-500">
                            <PlayCircleIcon className="w-4 h-4" /> Recording verfügbar
                          </div>
                        )}
                        {!item.hatTranskript && !item.hatRecording && !item.kiZusammenfassung && (
                          <p className="text-xs text-gray-400">Keine weiteren Details verfügbar.</p>
                        )}
                      </div>
                    )}
                    {item.sourceType === 'email' && (
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">
                          {item.richtung === 'inbound' ? 'Eingehende Email' : 'Ausgehende Email'}
                        </p>
                        <p className="text-xs text-gray-700 font-medium">{item.preview}</p>
                        <p className="text-[10px] text-gray-400 mt-1">Status: {item.status}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
