'use client'

// 2026-05-12 Funnel v3 PR #8: Realtime-Subscriptions fuer Dispatcher.
// Lauscht auf:
//   - leads (INSERT) — neuer Lead direkt angelegt (Telefon-Inbound)
//   - gutachter_finder_anfragen (INSERT, status='entwurf') — Self-Dispatch
//     hat Wizard begonnen
//   - gutachter_finder_anfragen (UPDATE, status='konvertiert') — Self-Dispatch
//     hat Wizard durchgelaufen, Lead+Fall angelegt
// Plus Desktop-Notification + Sound + Toast + router.refresh().

import { useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function RealtimeLeadAlert() {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    function ping(message: string) {
      try {
        if (!audioRef.current) {
          audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZaXl5eUkIyHg39zcGhrcHZ8g4mNj5CPjouHg395c25rb3R5fYKGiYuMjIuJhoN/e3dzcG5vc3d7f4OHiouLi4mHhIF+endzcG5uc3h8gISHiYuLiomGg4B9eXVxbm5xdXl9gYWIiouKiYeFgn95dnJvbm9ydnp+goaJi4uKiIWCf3x4dHBub3J2en6Ch4mLi4qIhYJ/e3h0cG5vcnZ6foKGiYuLioiFgn98eHRwbm9ydnp+goaJi4uKiIWCf3t4dHBub3J2en6BhYiKiomHhIF+e3dzcG5vcnZ7f4OHiouLiYeEgX56dnJvbnBydn')
        }
        audioRef.current.play().catch(() => {})
      } catch { /* Audio optional */ }
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('Claimondo Dispatcher', { body: message, icon: '/favicon.ico' })
      }
    }

    const channel = supabase
      .channel('dispatch-realtime')
      // ─── Klassische Leads (Telefon-Inbound, manueller Lead-Anlage) ───
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const lead = payload.new as { vorname?: string; nachname?: string; telefon?: string }
          const name = `${lead.vorname ?? ''} ${lead.nachname ?? ''}`.trim() || 'Unbekannt'
          ping(`Neuer Lead: ${name}`)
          toast.success(`Neuer Lead: ${name}`, { description: lead.telefon ?? '' })
          router.refresh()
        },
      )
      // ─── 2026-05-12 Self-Dispatch-Wizard begonnen (Entwurfs-Anfrage) ─
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'gutachter_finder_anfragen' },
        (payload) => {
          const a = payload.new as { vorname?: string; nachname?: string; ort?: string }
          const name = `${a.vorname ?? ''} ${a.nachname ?? ''}`.trim()
          // Beim Phase-1-Submit ist der Name noch leer — Standort gibt Hinweis
          const label = name || (a.ort ? `Anonym aus ${a.ort}` : 'Anonymer Lead')
          toast.info(`Self-Dispatch begonnen: ${label}`)
          // Kein Sound + keine Desktop-Notification — zu viele Events
          router.refresh()
        },
      )
      // ─── 2026-05-12 Self-Dispatch konvertiert (Wizard durch) ─────────
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gutachter_finder_anfragen',
          filter: 'status=eq.konvertiert',
        },
        (payload) => {
          const a = payload.new as { vorname?: string; nachname?: string }
          const name = `${a.vorname ?? ''} ${a.nachname ?? ''}`.trim() || 'Self-Dispatch'
          ping(`Self-Dispatch durchgelaufen: ${name}`)
          toast.success(`Self-Dispatch konvertiert: ${name}`, {
            description: 'Lead + Fall angelegt, LexDrive-Mandat ausgeloest',
          })
          router.refresh()
        },
      )
      .subscribe()

    // Request notification permission once
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => { supabase.removeChannel(channel) }
  }, [router])

  return null
}
