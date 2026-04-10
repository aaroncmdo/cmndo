'use client'

import { useState, useTransition } from 'react'
import { MessageCircleIcon, SendIcon, SearchIcon, UserIcon } from 'lucide-react'
import Link from 'next/link'
import { sendNachrichtFromInbox } from './actions'

// KFZ-182 Phase C: Gesamt-Chat-Inbox — WhatsApp-like Layout mit Threads + Chat-Stream.

type Nachricht = {
  id: string
  fall_id: string | null
  kanal: string
  sender_id: string | null
  sender_rolle: string | null
  nachricht: string | null
  hat_anhang: boolean
  created_at: string
  kb_empfaenger_id: string | null
  richtung: string | null
}

type Thread = {
  fallId: string | null
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  messages: Nachricht[]
}

type FilterKey = 'alle' | 'meine' | 'unzugeordnet'

export default function NachrichtenInboxClient({
  threads,
  userId,
  isAdmin,
}: {
  threads: Thread[]
  userId: string
  isAdmin: boolean
}) {
  const [filter, setFilter] = useState<FilterKey>('alle')
  const [search, setSearch] = useState('')
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, startSend] = useTransition()

  const filtered = threads.filter(t => {
    if (filter === 'unzugeordnet') return !t.fallId
    if (filter === 'meine') return t.messages.some(m => m.kb_empfaenger_id === userId)
    return true
  }).filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.kundeName.toLowerCase().includes(s) || (t.fallNummer ?? '').toLowerCase().includes(s)
  })

  function fmtTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) {
      return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    }
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-xl font-semibold text-gray-900">Nachrichten</h1>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Thread List */}
        <div className="w-80 border-r border-gray-200 flex flex-col bg-white shrink-0">
          {/* Filters */}
          <div className="px-3 py-2 border-b border-gray-100 space-y-2">
            <div className="flex gap-1">
              {(['alle', 'meine', 'unzugeordnet'] as FilterKey[]).map(f => (
                <button key={f} onClick={() => setFilter(f)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-colors ${filter === f ? 'bg-[#1E3A5F] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {f === 'alle' ? 'Alle' : f === 'meine' ? 'Meine' : 'Unzugeordnet'}
                </button>
              ))}
            </div>
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Suchen..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[#4573A2]" />
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Keine Chats</p>
            ) : (
              filtered.map((t, i) => (
                <button key={t.fallId ?? `u-${i}`} onClick={() => { setActiveThread(t); setReplyText('') }}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeThread?.fallId === t.fallId ? 'bg-[#4573A2]/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-[#4573A2]/10 flex items-center justify-center shrink-0">
                        <UserIcon className="w-4 h-4 text-[#4573A2]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.kundeName}</p>
                        <p className="text-[10px] text-gray-400 truncate">{t.fallNummer ?? 'Kein Fall'}</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-2">
                      <p className="text-[9px] text-gray-400">{fmtTime(t.lastAt)}</p>
                      {t.unreadCount > 0 && (
                        <span className="inline-flex items-center justify-center w-4.5 h-4.5 bg-[#4573A2] text-white text-[9px] font-bold rounded-full mt-0.5">
                          {t.unreadCount > 99 ? '99+' : t.unreadCount}
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate pl-10">{t.lastMessage}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Active Chat Thread */}
        <div className="flex-1 flex flex-col bg-[#f8f9fb]">
          {!activeThread ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center text-gray-400">
                <MessageCircleIcon className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-sm">Chat auswählen</p>
              </div>
            </div>
          ) : (
            <>
              {/* Thread Header */}
              <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{activeThread.kundeName}</p>
                  {activeThread.fallId && (
                    <Link href={`/admin/faelle/${activeThread.fallId}`} className="text-[10px] text-[#4573A2] hover:underline">
                      {activeThread.fallNummer ?? activeThread.fallId.slice(0, 8)} →
                    </Link>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {[...(activeThread.messages ?? [])].reverse().map(msg => {
                  const isKunde = msg.sender_rolle === 'kunde' || msg.richtung === 'inbound'
                  return (
                    <div key={msg.id} className={`flex ${isKunde ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${
                        isKunde ? 'bg-white border border-gray-200 text-gray-800' : 'bg-[#4573A2] text-white'
                      }`}>
                        <p className="whitespace-pre-wrap">{msg.nachricht}</p>
                        <p className={`text-[9px] mt-1 ${isKunde ? 'text-gray-400' : 'text-white/60'}`}>
                          {new Date(msg.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Reply Input */}
              <div className="bg-white border-t border-gray-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <input type="text" value={replyText} onChange={e => setReplyText(e.target.value)}
                    placeholder="Nachricht schreiben..."
                    onKeyDown={e => {
                      if (e.key === 'Enter' && replyText.trim() && activeThread?.fallId) {
                        const text = replyText; setReplyText('')
                        startSend(async () => { await sendNachrichtFromInbox(activeThread.fallId!, text) })
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[#4573A2]" />
                  <button disabled={!replyText.trim() || !activeThread?.fallId || sending}
                    onClick={() => {
                      if (!replyText.trim() || !activeThread?.fallId) return
                      const text = replyText; setReplyText('')
                      startSend(async () => { await sendNachrichtFromInbox(activeThread.fallId!, text) })
                    }}
                    className="p-2 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white disabled:opacity-40 transition-colors">
                    <SendIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
