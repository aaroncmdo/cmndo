'use client'

// AAR-102: Split-View Inbox mit Conversations-Liste + MultiChannelChat
import { useState } from 'react'
import Link from 'next/link'
import { MessageCircleIcon, ArrowRightIcon } from 'lucide-react'
import MultiChannelChat from '@/components/chat/MultiChannelChat'

type Thread = {
  fallId: string
  fallNummer: string | null
  kennzeichen: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  lastKanal: string
  unreadCount: number
}

export default function NachrichtenInboxClient({
  threads,
  currentUserId,
}: {
  threads: Thread[]
  currentUserId: string
}) {
  const [selectedFallId, setSelectedFallId] = useState<string | null>(threads[0]?.fallId ?? null)
  const selected = threads.find(t => t.fallId === selectedFallId) ?? null

  return (
    <div className="py-6 px-4 space-y-4 max-w-7xl mx-auto">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Nachrichten</h1>
        <p className="text-sm text-gray-500 mt-1">Alle Kommunikationskanaele mit Kunden + Gutachter pro Fall.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Linke Spalte: Conversations */}
        <div className="lg:col-span-1 bg-white rounded-xl border border-gray-200 overflow-hidden h-[600px] flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase">
            {threads.length} Konversationen
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-50">
            {threads.map(t => (
              <button
                key={t.fallId}
                onClick={() => setSelectedFallId(t.fallId)}
                className={`w-full text-left px-4 py-3 hover:bg-gray-50 transition-colors ${
                  selectedFallId === t.fallId ? 'bg-blue-50/50 border-l-4 border-l-[#4573A2]' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 truncate">{t.kundeName}</p>
                    <p className="text-xs text-gray-500 truncate mt-0.5">{t.lastMessage || '—'}</p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {t.fallNummer ?? t.fallId.slice(0, 8)}
                      {t.kennzeichen && ` · ${t.kennzeichen}`}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    <span className="text-[10px] text-gray-400">
                      {new Date(t.lastAt).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {t.unreadCount > 0 && (
                      <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1">
                        {t.unreadCount}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
            {threads.length === 0 && (
              <div className="p-8 text-center">
                <MessageCircleIcon className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">Keine Nachrichten.</p>
              </div>
            )}
          </div>
        </div>

        {/* Rechte Spalte: MultiChannelChat */}
        <div className="lg:col-span-2 space-y-3">
          {selected ? (
            <>
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 flex items-center justify-between">
                <Link href={`/admin/faelle/${selected.fallId}`} className="min-w-0 group">
                  <h2 className="text-base font-semibold text-gray-900 group-hover:underline">{selected.kundeName}</h2>
                  <p className="text-xs text-gray-500">
                    Fall: {selected.fallNummer ?? selected.fallId.slice(0, 8)}
                    {selected.kennzeichen && ` · ${selected.kennzeichen}`}
                  </p>
                </Link>
                <Link href={`/admin/faelle/${selected.fallId}`} className="text-xs text-[#4573A2] hover:underline inline-flex items-center gap-1">
                  Fallakte oeffnen <ArrowRightIcon className="w-3 h-3" />
                </Link>
              </div>
              <MultiChannelChat
                fallId={selected.fallId}
                currentUserId={currentUserId}
                showInternalKbSvChat={false}
                defaultKanal="whatsapp"
              />
            </>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 h-[600px] flex items-center justify-center">
              <p className="text-sm text-gray-400">Bitte Konversation links auswaehlen.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
