'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { SendIcon } from 'lucide-react'

type Nachricht = {
  id: string
  kanal: string
  sender_id: string
  sender_rolle: string
  nachricht: string
  hat_anhang: boolean | null
  anhang_url: string | null
  created_at: string
}

const ROLLE_LABEL: Record<string, string> = {
  kunde: 'Sie',
  admin: 'Claimondo',
  kundenbetreuer: 'Ihr Betreuer',
  gutachter: 'Gutachter',
  system: 'System',
}

export default function ChatClient({
  fallId,
  nachrichten: initialNachrichten,
  userId,
}: {
  fallId: string
  nachrichten: Nachricht[]
  userId: string
}) {
  const router = useRouter()
  const [messages, setMessages] = useState(initialNachrichten)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    setError(null)

    const { sendNachricht } = await import('@/app/kunde/faelle/[id]/actions')
    try {
      await sendNachricht(fallId, text.trim(), 'chat_kb_kunde')
      // Optimistic: add message locally
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        kanal: 'chat_kb_kunde',
        sender_id: userId,
        sender_rolle: 'kunde',
        nachricht: text.trim(),
        hat_anhang: false,
        anhang_url: null,
        created_at: new Date().toISOString(),
      }])
      setText('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Senden')
    } finally {
      setSending(false)
    }
  }

  return (
    // AAR-452: 100dvh statt 100vh (iOS Dynamic Viewport) + 8.5rem deckt
    // Mobile-Header (3.5rem pt) + Bottom-Nav-Padding (~5rem pb) sauber ab.
    <div className="flex flex-col h-[calc(100dvh-8.5rem)] md:h-[calc(100vh-3rem)] max-w-lg mx-auto">
      {/* Header */}
      <div className="px-5 pt-5 pb-3">
        <h1 className="text-xl font-bold text-[#0D1B3E]">Chat</h1>
        <p className="text-sm text-gray-500">Stellen Sie hier Ihre Fragen an Ihr Claimondo-Team.</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 space-y-3">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Noch keine Nachrichten. Schreiben Sie uns!</p>
          </div>
        )}
        {messages.map(msg => {
          const isOwn = msg.sender_id === userId
          return (
            <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                isOwn
                  ? 'bg-[#4573A2] text-white'
                  : 'bg-white border border-gray-200 text-[#0D1B3E]'
              }`}>
                <p className={`text-[10px] font-semibold uppercase tracking-wide mb-0.5 ${
                  isOwn ? 'text-white/60' : 'text-gray-400'
                }`}>
                  {ROLLE_LABEL[msg.sender_rolle] ?? msg.sender_rolle}
                </p>
                <p className="text-sm whitespace-pre-wrap">{msg.nachricht}</p>
                {msg.hat_anhang && msg.anhang_url && (
                  <a href={msg.anhang_url} target="_blank" rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 mt-1 text-xs underline ${isOwn ? 'text-white/70' : 'text-[#4573A2]'}`}>
                    Anhang
                  </a>
                )}
                <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/50' : 'text-gray-400'}`}>
                  {new Date(msg.created_at).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-3 border-t border-gray-200 bg-white">
        {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="text"
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Nachricht schreiben..."
            // AAR-452: text-base (16px) verhindert iOS-Autozoom beim Fokus
            className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-base text-[#0D1B3E] placeholder-gray-400 focus:outline-none focus:border-[#4573A2]"
          />
          <button
            type="submit"
            disabled={sending || !text.trim()}
            className="px-4 py-3 bg-[#4573A2] hover:bg-[#1E3A5F] text-white rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center min-h-12"
          >
            {sending ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <SendIcon className="w-5 h-5" />}
          </button>
        </form>
      </div>
    </div>
  )
}
