'use client'

import { useState, useTransition } from 'react'
import { MessageCircleIcon, UserIcon, SearchIcon, SendIcon } from 'lucide-react'
import Link from 'next/link'
import { sendNachrichtFromSvInbox } from './_actions'

// KFZ-182: SV-Nachrichten-Inbox — nur eigene Fall-Chats.

type Nachricht = {
  id: string
  fall_id: string | null
  kanal: string
  sender_id: string | null
  sender_rolle: string | null
  nachricht: string | null
  hat_anhang: boolean
  created_at: string
  richtung: string | null
}

type Thread = {
  fallId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
  messages: Nachricht[]
}

export default function NachrichtenSvClient({ threads }: { threads: Thread[] }) {
  const [search, setSearch] = useState('')
  const [activeThread, setActiveThread] = useState<Thread | null>(null)
  const [replyText, setReplyText] = useState('')
  const [sending, startSend] = useTransition()

  const filtered = threads.filter(t => {
    if (!search) return true
    const s = search.toLowerCase()
    return t.kundeName.toLowerCase().includes(s) || (t.fallNummer ?? '').toLowerCase().includes(s)
  })

  function fmtTime(iso: string) {
    const d = new Date(iso)
    const today = new Date()
    if (d.toDateString() === today.toDateString()) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })
  }

  return (
    <div className="h-full flex flex-col">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
        <h1 className="text-xl font-semibold text-gray-900">Nachrichten</h1>
      </div>

      <div className="flex-1 flex min-h-0">
        {/* Left: Thread List */}
        <div className="w-72 border-r border-gray-200 flex flex-col bg-white shrink-0">
          <div className="px-3 py-2 border-b border-gray-100">
            <div className="relative">
              <SearchIcon className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Suchen..." className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-[var(--brand-secondary)]" />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-8">Keine Chats</p>
            ) : (
              filtered.map(t => (
                <button key={t.fallId} onClick={() => setActiveThread(t)}
                  className={`w-full text-left px-3 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${activeThread?.fallId === t.fallId ? 'bg-[var(--brand-secondary)]/5' : ''}`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-7 h-7 rounded-full bg-[var(--brand-secondary)]/10 flex items-center justify-center shrink-0">
                        <UserIcon className="w-3.5 h-3.5 text-[var(--brand-secondary)]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{t.kundeName}</p>
                        <p className="text-[10px] text-gray-400 truncate">{t.fallNummer ?? t.fallId.slice(0, 8)}</p>
                      </div>
                    </div>
                    <span className="text-[9px] text-gray-400 shrink-0 ml-2">{fmtTime(t.lastAt)}</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1 truncate pl-9">{t.lastMessage}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right: Chat */}
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
              <div className="bg-white border-b border-gray-200 px-4 py-3">
                <p className="text-sm font-semibold text-gray-900">{activeThread.kundeName}</p>
                <Link href={`/gutachter/fall/${activeThread.fallId}`} className="text-[10px] text-[var(--brand-secondary)] hover:underline">
                  {activeThread.fallNummer ?? activeThread.fallId.slice(0, 8)} →
                </Link>
              </div>
              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                {[...(activeThread.messages ?? [])].reverse().map(msg => {
                  const isKunde = msg.sender_rolle === 'kunde' || msg.richtung === 'inbound'
                  return (
                    <div key={msg.id} className={`flex ${isKunde ? 'justify-start' : 'justify-end'}`}>
                      <div className={`max-w-[70%] px-3 py-2 rounded-2xl text-sm ${
                        isKunde ? 'bg-white border border-gray-200 text-gray-800' : 'bg-[var(--brand-secondary)] text-white'
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
                      if (e.key === 'Enter' && replyText.trim() && activeThread) {
                        const text = replyText; setReplyText('')
                        startSend(async () => { await sendNachrichtFromSvInbox(activeThread.fallId, text) })
                      }
                    }}
                    className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:border-[var(--brand-secondary)]" />
                  <button disabled={!replyText.trim() || sending}
                    onClick={() => {
                      if (!replyText.trim() || !activeThread) return
                      const text = replyText; setReplyText('')
                      startSend(async () => { await sendNachrichtFromSvInbox(activeThread.fallId, text) })
                    }}
                    className="p-2 rounded-xl bg-[var(--brand-primary)] hover:bg-[var(--brand-secondary)] text-white disabled:opacity-40 transition-colors">
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
