'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { SendIcon, ImageIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/primitives'

type Msg = { id: string; sender_id: string | null; sender_rolle: string | null; nachricht: string; hat_anhang: boolean; anhang_url: string | null; created_at: string; kanal?: string | null }

export default function ChatChannel({ fallId, kanal, currentUserId, readOnly }: {
  fallId: string; kanal: string; currentUserId: string; readOnly?: boolean
}) {
  const supabase = useMemo(() => createClient(), [])
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // KFZ-129: kanal='alle' zeigt alle Nachrichten
    const query = supabase.from('nachrichten').select('id, sender_id, sender_rolle, nachricht, hat_anhang, anhang_url, created_at')
      .eq('fall_id', fallId).order('created_at', { ascending: true })
    if (kanal !== 'alle') query.eq('kanal', kanal)
    query.then(({ data }) => { setMessages(data ?? []); setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100) })

    const channel = supabase.channel(`chat-${fallId}-${kanal}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'nachrichten', filter: `fall_id=eq.${fallId}` },
        (payload) => { const n = payload.new as Msg; if (kanal === 'alle' || n.kanal === kanal) setMessages(prev => [...prev, n]) })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [fallId, kanal, supabase])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function send() {
    if (!input.trim() || readOnly) return; setSending(true)
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', currentUserId).single()
    await supabase.from('nachrichten').insert({ fall_id: fallId, kanal, sender_id: currentUserId, sender_rolle: profile?.rolle ?? 'system', nachricht: input.trim(), hat_anhang: false })
    setInput(''); setSending(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {messages.length === 0 && <p className="text-center text-claimondo-ondo/70 text-xs py-8">Noch keine Nachrichten</p>}
        {messages.map(m => {
          const isOwn = m.sender_id === currentUserId
          const isSystem = m.sender_rolle === 'system' || !m.sender_id

          // KFZ-134: System-Messages zentriert + eigener Style
          if (isSystem) {
            return (
              <div key={m.id} className="flex justify-center">
                <div className="bg-claimondo-bg border border-claimondo-light-blue/30 rounded-ios-xl px-4 py-2 max-w-[85%]">
                  <p className="text-xs text-claimondo-navy text-center whitespace-pre-wrap">{m.nachricht}</p>
                  <p className="text-[9px] text-claimondo-ondo/70 text-center mt-1">{new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
                </div>
              </div>
            )
          }

          return (
            <div key={m.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] px-3 py-2 rounded-ios-xl text-sm ${isOwn ? 'bg-claimondo-shield text-white rounded-br-sm' : 'bg-claimondo-bg text-claimondo-navy rounded-bl-sm'}`}>
                {!isOwn && <p className="text-[10px] font-medium mb-0.5 opacity-70">{m.sender_rolle ?? ''}</p>}
                <p className="whitespace-pre-wrap">{m.nachricht}</p>
                <p className={`text-[9px] mt-1 ${isOwn ? 'text-claimondo-light-blue' : 'text-claimondo-ondo/70'}`}>{new Date(m.created_at).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</p>
              </div>
            </div>
          )
        })}
        <div ref={endRef} />
      </div>
      {!readOnly && (
        <div className="flex-shrink-0 border-t border-claimondo-border p-2 flex gap-2">
          <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Nachricht..." className="flex-1 bg-white border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-claimondo-ondo" />
          <Button
            tone="navy"
            size="icon"
            onPress={send}
            disabled={sending || !input.trim()}
            ariaLabel="Nachricht senden"
            iconLeft={<SendIcon className="w-4 h-4" />}
          />

        </div>
      )}
      {readOnly && <div className="flex-shrink-0 border-t border-claimondo-border p-2 text-center text-claimondo-ondo/70 text-xs">Nur Lesen — dieser Kanal ist zwischen Kunde und Gutachter</div>}
    </div>
  )
}
