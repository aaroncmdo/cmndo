'use client'

// Wiederverwendbare Chat-UI fuer EINEN Thread (Phase 2). Nutzt den Thread-Service (thread-actions)
// + den puren Format-Helfer. Realtime via Supabase postgres_changes (thread-Mitglieder sehen die
// thread-nativen Nachrichten dank nachrichten_thread_member_select-Policy). Konsumierbar aus jedem
// Portal (erster Consumer: Admin-Werkstatt-Detailview; spaeter Werkstatt/Kanzlei/Kunde/SV).

import { useEffect, useRef, useState } from 'react'
import { SendIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/primitives'
import {
  ladeThreadNachrichten,
  sendeThreadNachricht,
  markiereThreadGelesen,
  type ThreadNachricht,
} from '@/lib/chat/thread-actions'
import { gruppiereNachrichtenNachTag } from '@/lib/chat/thread-chat-format'

function zeit(iso: string): string {
  return new Date(iso).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })
}

export function ClaimThreadChat({
  threadId,
  currentUserId,
  whatsappHinweis = false,
}: {
  threadId: string
  currentUserId: string
  /** Zeigt „geht auch per WhatsApp raus" ueber dem Composer (nur Staff in kunde_gruppe). */
  whatsappHinweis?: boolean
}) {
  const [nachrichten, setNachrichten] = useState<ThreadNachricht[]>([])
  const [text, setText] = useState('')
  const [laden, setLaden] = useState(true)
  const [sende, setSende] = useState(false)
  const endeRef = useRef<HTMLDivElement>(null)

  // Initial laden + als gelesen markieren
  useEffect(() => {
    let aktiv = true
    void (async () => {
      const res = await ladeThreadNachrichten(threadId)
      if (aktiv && res.ok) setNachrichten(res.data)
      if (aktiv) setLaden(false)
      void markiereThreadGelesen(threadId)
    })()
    return () => {
      aktiv = false
    }
  }, [threadId])

  // Realtime: neue Nachrichten des Threads anhaengen (RLS liefert nur sichtbare)
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`thread:${threadId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nachrichten', filter: `thread_id=eq.${threadId}` },
        (payload) => {
          const row = payload.new as ThreadNachricht
          setNachrichten((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, row]))
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [threadId])

  // Auto-scroll ans Ende bei neuen Nachrichten
  useEffect(() => {
    endeRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [nachrichten.length])

  async function senden() {
    const inhalt = text.trim()
    if (!inhalt || sende) return
    setSende(true)
    try {
      const res = await sendeThreadNachricht(threadId, inhalt)
      if (!res.ok) return
      setText('')
      // optimistisch anhaengen (Realtime dedupet ueber id)
      setNachrichten((prev) =>
        prev.some((m) => m.id === res.data)
          ? prev
          : [
              ...prev,
              {
                id: res.data,
                sender_id: currentUserId,
                sender_rolle: null,
                nachricht: inhalt,
                richtung: 'outbound',
                status: 'gesendet',
                created_at: new Date().toISOString(),
              },
            ],
      )
    } finally {
      setSende(false)
    }
  }

  const gruppen = gruppiereNachrichtenNachTag(nachrichten, new Date().toISOString())

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex-1 min-h-0 overflow-y-auto space-y-4 p-3">
        {laden ? (
          <p className="text-body-sm text-claimondo-ondo text-center py-6">Wird geladen…</p>
        ) : nachrichten.length === 0 ? (
          <p className="text-body-sm text-claimondo-ondo text-center py-6">Noch keine Nachrichten. Schreib die erste.</p>
        ) : (
          gruppen.map((g) => (
            <div key={g.tagLabel} className="space-y-2">
              <div className="text-center">
                <span className="text-body-xs text-claimondo-ondo bg-claimondo-bg rounded-ios-sm px-2 py-0.5">{g.tagLabel}</span>
              </div>
              {g.nachrichten.map((m) => {
                const eigen = m.sender_id === currentUserId
                return (
                  <div key={m.id} className={`flex ${eigen ? 'justify-end' : 'justify-start'}`}>
                    <div
                      className={`max-w-[75%] rounded-ios-lg px-3 py-2 ${eigen ? 'bg-claimondo-navy text-white' : 'bg-claimondo-bg text-claimondo-navy'}`}
                    >
                      <p className="text-body-sm whitespace-pre-wrap break-words">{m.nachricht}</p>
                      <p className={`text-body-xs mt-0.5 ${eigen ? 'text-white/70' : 'text-claimondo-ondo'}`}>{zeit(m.created_at)}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          ))
        )}
        <div ref={endeRef} />
      </div>
      <div className="border-t border-claimondo-border p-2">
        {whatsappHinweis && (
          <div className="mb-1.5 flex items-center gap-1.5 text-caption text-claimondo-ondo/70">
            <SendIcon className="w-3 h-3 shrink-0" />
            <span>Der Kunde erhält diese Nachricht auch per WhatsApp.</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                void senden()
              }
            }}
            rows={1}
            placeholder="Nachricht schreiben…"
            className="flex-1 resize-none rounded-ios-md border border-claimondo-border bg-white px-3 py-2 text-body-sm text-claimondo-navy focus:outline-none focus:border-claimondo-ondo max-h-32"
          />
          <Button variant="navy" size="sm" loading={sende} disabled={!text.trim()} onClick={senden} iconLeft={<SendIcon className="w-4 h-4" />}>
            Senden
          </Button>
        </div>
      </div>
    </div>
  )
}
