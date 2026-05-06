'use client'

// Liefert die Zahl ungelesener Nachrichten eines Kanals fuer den aktuellen
// Kunden. Subscribed Realtime auf nachrichten-INSERTs (kanal=eq.X) und
// erhoeht den Zaehler wenn die Zeile an currentUserId adressiert ist UND
// der Sender NICHT der Kunde selber ist (eigene Nachrichten zaehlen nicht
// als "neu zu lesen").
//
// reset() setzt den Zaehler manuell auf 0 — z.B. wenn der Kunde das Chat-
// Modal oeffnet (KundeKbChat ruft beim Mount markKundeChatMessagesRead).

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

type Nachricht = {
  id: string
  empfaenger_id: string | null
  sender_id: string | null
  gelesen: boolean | null
  kanal: string | null
}

export function useKundeUnreadByKanal(
  currentUserId: string | null,
  kanal: 'chat_kb_kunde' | 'gruppenchat' | 'chat_kunde_sv',
): { count: number; reset: () => void } {
  const [count, setCount] = useState(0)
  const channelSuffix = useId()
  const cancelledRef = useRef(false)

  const reset = useCallback(() => setCount(0), [])

  useEffect(() => {
    if (!currentUserId) return
    cancelledRef.current = false
    const supabase = createClient()

    void supabase
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('kanal', kanal)
      .eq('empfaenger_id', currentUserId)
      .eq('gelesen', false)
      .neq('sender_id', currentUserId)
      .then(({ count: c }) => {
        if (!cancelledRef.current) setCount(c ?? 0)
      })

    const channel = supabase
      .channel(`kunde-unread-${kanal}-${channelSuffix}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nachrichten', filter: `kanal=eq.${kanal}` },
        (payload) => {
          const row = payload.new as Nachricht
          if (row.empfaenger_id !== currentUserId) return
          if (row.sender_id === currentUserId) return
          if (row.gelesen) return
          setCount((c) => c + 1)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'nachrichten', filter: `kanal=eq.${kanal}` },
        (payload) => {
          // Wenn eine bisher ungelesene Nachricht auf gelesen=true gesetzt
          // wird (z.B. durch markKundeChatMessagesRead), kann der Counter
          // unter den lokalen optimistic-Reset fallen — wir korrigieren mit
          // einem Re-Fetch, statt umstaendlich Diff-Logik zu fahren.
          const oldRow = (payload.old as Nachricht | null) ?? null
          const newRow = (payload.new as Nachricht | null) ?? null
          if (!oldRow || !newRow) return
          if (oldRow.gelesen === false && newRow.gelesen === true && newRow.empfaenger_id === currentUserId) {
            void supabase
              .from('nachrichten')
              .select('id', { count: 'exact', head: true })
              .eq('kanal', kanal)
              .eq('empfaenger_id', currentUserId)
              .eq('gelesen', false)
              .neq('sender_id', currentUserId)
              .then(({ count: c }) => {
                if (!cancelledRef.current) setCount(c ?? 0)
              })
          }
        },
      )
      .subscribe()

    return () => {
      cancelledRef.current = true
      supabase.removeChannel(channel)
    }
  }, [currentUserId, kanal, channelSuffix])

  return { count, reset }
}
