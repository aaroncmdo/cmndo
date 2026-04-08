'use client'

import { useState, useEffect, useCallback } from 'react'
import { PhoneIcon, MailIcon, MessageSquareIcon, InfoIcon, ChevronDownIcon, SearchIcon, Loader2Icon } from 'lucide-react'
import type { TimelineItem } from '@/lib/fall/communication-timeline'

const TYPE_CONFIG = {
  call: { icon: PhoneIcon, color: '#4573A2', label: 'Anrufe' },
  email: { icon: MailIcon, color: '#E89B3C', label: 'Emails' },
  chat: { icon: MessageSquareIcon, color: '#5DAA80', label: 'Chat' },
  system: { icon: InfoIcon, color: '#7B7B8A', label: 'System' },
} as const

export default function CommunicationTimeline({
  fallId,
  initialItems,
  initialHasMore,
}: {
  fallId: string
  initialItems: TimelineItem[]
  initialHasMore: boolean
}) {
  const [items, setItems] = useState(initialItems)
  const [hasMore, setHasMore] = useState(initialHasMore)
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set(['call', 'email', 'chat', 'system']))
  const [search, setSearch] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [callDetail, setCallDetail] = useState<Record<string, unknown> | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  const filtered = items.filter(i => {
    if (!typeFilter.has(i.sourceType)) return false
    if (search) {
      const s = search.toLowerCase()
      return i.preview.toLowerCase().includes(s) || i.initiatorName.toLowerCase().includes(s) || i.empfaengerName.toLowerCase().includes(s)
    }
    return true
  })

  function toggleType(t: string) {
    setTypeFilter(prev => { const next = new Set(prev); if (next.has(t)) next.delete(t); else next.add(t); return next })
  }

  async function handleExpand(item: TimelineItem) {
    if (expandedId === item.id) { setExpandedId(null); setCallDetail(null); return }
    setExpandedId(item.id)

    // Lazy-load call transcript
    if (item.sourceType === 'call' && (item.hatTranskript || item.hatRecording || item.kiZusammenfassung)) {
      setLoadingDetail(true)
      try {
        const { getCallTranscriptDetail } = await import('@/lib/fall/communication-timeline')
        const detail = await getCallTranscriptDetail(item.sourceId)
        setCallDetail(detail as unknown as Record<string, unknown>)
      } catch { setCallDetail(null) }
      setLoadingDetail(false)
    }
  }

  async function loadMore() {
    setLoadingMore(true)
    try {
      const { getCommunicationTimeline } = await import('@/lib/fall/communication-timeline')
      const result = await getCommunicationTimeline(fallId, { offset: items.length, limit: 50 })
      setItems(prev => [...prev, ...result.items])
      setHasMore(result.hasMore)
    } catch { /* */ }
    setLoadingMore(false)
  }

  return (
    <div>
      {/* Filter-Bar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-1.5">
          {(Object.entries(TYPE_CONFIG) as [string, { icon: typeof PhoneIcon; color: string; label: string }][]).map(([key, cfg]) => {
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
        <div className="relative flex-1 min-w-[120px] max-w-xs">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suchen..."
            className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#4573A2]" />
        </div>
      </div>

      {/* Timeline */}
      {filtered.length === 0 && <p className="text-center text-gray-400 text-sm py-8">Keine Kommunikation vorhanden.</p>}

      <div className="space-y-0">
        {filtered.map((item, idx) => {
          const cfg = TYPE_CONFIG[item.sourceType as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.system
          const Icon = cfg.icon
          const isExpanded = expandedId === item.id
          const isLast = idx === filtered.length - 1

          return (
            <div key={item.id} className="flex">
              {/* Timeline-Linie */}
              <div className="flex flex-col items-center mr-3 w-7">
                <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ backgroundColor: cfg.color + '15' }}>
                  <Icon className="w-3.5 h-3.5" style={{ color: cfg.color }} />
                </div>
                {!isLast && <div className="w-0.5 flex-1 min-h-3 bg-gray-200" />}
              </div>

              {/* Content */}
              <div className="flex-1 pb-3 min-w-0">
                <button onClick={() => handleExpand(item)} className="w-full text-left group">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium text-gray-800">
                          {item.richtung === 'outbound' ? '→' : item.richtung === 'inbound' ? '←' : item.richtung === 'bridge' ? '↔' : '•'}{' '}
                          {item.initiatorName}
                          {item.empfaengerName && item.richtung !== 'system' && ` → ${item.empfaengerName}`}
                        </span>
                        {item.ausLeadPhase && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-[#4573A2]/10 text-[#4573A2] font-medium">Aus Lead-Phase</span>
                        )}
                        {item.bridgeTyp && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 font-medium">Bridge</span>
                        )}
                        {item.sentiment && (
                          <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                            item.sentiment === 'Zufrieden' ? 'bg-green-50 text-green-600' :
                            item.sentiment === 'Verärgert' ? 'bg-red-50 text-red-600' :
                            'bg-gray-100 text-gray-500'
                          }`}>{item.sentiment}</span>
                        )}
                        {item.dauer != null && (
                          <span className="text-[10px] text-gray-400">{Math.floor(item.dauer / 60)}:{String(item.dauer % 60).padStart(2, '0')}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{item.preview}</p>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <span className="text-[10px] text-gray-400 whitespace-nowrap">
                        {item.zeitpunkt ? new Date(item.zeitpunkt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                      </span>
                      {(item.sourceType === 'call' || item.sourceType === 'email') && (
                        <ChevronDownIcon className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      )}
                    </div>
                  </div>
                </button>

                {/* ─── Expanded: Call Detail ──────────────────────────── */}
                {isExpanded && item.sourceType === 'call' && (
                  <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                    {loadingDetail ? (
                      <div className="flex items-center justify-center py-6"><Loader2Icon className="w-5 h-5 text-gray-400 animate-spin" /></div>
                    ) : callDetail ? (
                      <CallDetailPanel detail={callDetail} item={item} />
                    ) : (
                      <div className="p-4">
                        {item.kiZusammenfassung && <p className="text-xs text-gray-700 mb-2">{item.kiZusammenfassung}</p>}
                        {!item.hatTranskript && !item.hatRecording && <p className="text-xs text-gray-400">Keine weiteren Details.</p>}
                      </div>
                    )}
                  </div>
                )}

                {/* ─── Expanded: Email Detail ─────────────────────────── */}
                {isExpanded && item.sourceType === 'email' && (
                  <div className="mt-2 bg-gray-50 rounded-xl border border-gray-200 p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-2">
                      {item.emailRichtung === 'inbound' ? 'Eingehende Email' : 'Ausgehende Email'}
                    </p>
                    <p className="text-xs text-gray-800 font-medium mb-2">{item.emailSubject}</p>
                    {item.emailBodyHtml ? (
                      <div className="bg-white rounded-lg border border-gray-200 p-3 max-h-64 overflow-y-auto">
                        <div className="text-xs text-gray-700" dangerouslySetInnerHTML={{ __html: item.emailBodyHtml }} />
                      </div>
                    ) : (
                      <p className="text-xs text-gray-600">{item.preview}</p>
                    )}
                    {item.emailAttachments && (item.emailAttachments as unknown[]).length > 0 && (
                      <div className="mt-2 flex gap-2 flex-wrap">
                        {(item.emailAttachments as Array<{ filename?: string }>).map((a, i) => (
                          <span key={i} className="text-[10px] px-2 py-1 bg-white border border-gray-200 rounded text-gray-600">{a.filename ?? 'Anhang'}</span>
                        ))}
                      </div>
                    )}
                    <p className="text-[10px] text-gray-400 mt-2">Status: {item.status}</p>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Load More */}
      {hasMore && (
        <div className="text-center py-4">
          <button onClick={loadMore} disabled={loadingMore}
            className="text-xs text-[#4573A2] hover:underline disabled:opacity-50">
            {loadingMore ? 'Wird geladen...' : 'Ältere laden'}
          </button>
        </div>
      )}
    </div>
  )
}

// ─── B.3: Call-Detail-Panel mit Speaker-Bubbles + Recording + KI ──────────

function CallDetailPanel({ detail, item }: { detail: Record<string, unknown>; item: TimelineItem }) {
  const [tab, setTab] = useState<'transkript' | 'recording' | 'ki'>('transkript')
  const utterances = (detail.utterances ?? []) as Array<{ speaker: string | null; text: string; startTime: number | null }>
  const recordingUrl = detail.recordingUrl as string | null
  const kiZusammenfassung = detail.kiZusammenfassung as string | null
  const kiNaechsteSchritte = detail.kiNaechsteSchritte as string | null
  const copilotSuggestions = (detail.copilotSuggestions ?? []) as Array<{ vorschlag: string; kategorie: string; ausloeser: string }>

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-gray-200">
        <button onClick={() => setTab('transkript')} className={`flex-1 py-2 text-xs font-medium border-b-2 ${tab === 'transkript' ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400'}`}>
          Transkript {utterances.length > 0 && `(${utterances.length})`}
        </button>
        {recordingUrl && (
          <button onClick={() => setTab('recording')} className={`flex-1 py-2 text-xs font-medium border-b-2 ${tab === 'recording' ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400'}`}>
            Recording
          </button>
        )}
        {(kiZusammenfassung || copilotSuggestions.length > 0) && (
          <button onClick={() => setTab('ki')} className={`flex-1 py-2 text-xs font-medium border-b-2 ${tab === 'ki' ? 'border-[#4573A2] text-[#4573A2]' : 'border-transparent text-gray-400'}`}>
            KI-Insights
          </button>
        )}
      </div>

      <div className="p-4">
        {/* ── Transkript mit Speaker-Bubbles ──────────────────────── */}
        {tab === 'transkript' && (
          utterances.length > 0 ? (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {utterances.map((u, i) => {
                const isAgent = u.speaker?.toLowerCase().includes('agent') || u.speaker?.toLowerCase().includes('claimondo') || u.speaker === 'user_1'
                return (
                  <div key={i} className={`flex ${isAgent ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[80%] rounded-xl px-3 py-2 ${isAgent ? 'bg-[#4573A2]/10 text-[#0D1B3E]' : 'bg-gray-100 text-gray-800'}`}>
                      <p className="text-[9px] font-semibold mb-0.5 opacity-60">{u.speaker ?? (isAgent ? 'Agent' : 'Kunde')}</p>
                      <p className="text-xs whitespace-pre-wrap">{u.text}</p>
                      {u.startTime != null && <p className="text-[9px] opacity-40 mt-0.5">{Math.floor(u.startTime / 60)}:{String(Math.floor(u.startTime % 60)).padStart(2, '0')}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="text-xs text-gray-400 text-center py-4">Kein Transkript verfügbar für diesen Anruf.</p>
          )
        )}

        {/* ── Recording Player ───────────────────────────────────── */}
        {tab === 'recording' && recordingUrl && (
          <div>
            <audio controls src={recordingUrl} className="w-full" preload="none">
              Ihr Browser unterstützt kein Audio-Playback.
            </audio>
            <p className="text-[10px] text-gray-400 mt-2">Recording wird von Aircall bereitgestellt.</p>
          </div>
        )}

        {/* ── KI-Insights ────────────────────────────────────────── */}
        {tab === 'ki' && (
          <div className="space-y-3">
            {kiZusammenfassung && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Zusammenfassung</p>
                <p className="text-xs text-gray-700">{kiZusammenfassung}</p>
              </div>
            )}
            {kiNaechsteSchritte && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Nächste Schritte</p>
                <p className="text-xs text-gray-700 whitespace-pre-wrap">{kiNaechsteSchritte}</p>
              </div>
            )}
            {copilotSuggestions.length > 0 && (
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Co-Pilot Suggestions ({copilotSuggestions.length})</p>
                <div className="space-y-1.5">
                  {copilotSuggestions.map((s, i) => (
                    <div key={i} className="bg-white border border-gray-200 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${
                          s.kategorie === 'einwand' ? 'bg-amber-50 text-amber-600' :
                          s.kategorie === 'fachinfo' ? 'bg-blue-50 text-blue-600' :
                          s.kategorie === 'closing' ? 'bg-green-50 text-green-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>{s.kategorie}</span>
                        <span className="text-[9px] text-gray-400">{s.ausloeser}</span>
                      </div>
                      <p className="text-xs text-gray-700">{s.vorschlag}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
