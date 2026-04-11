'use client'

import { useEffect, useRef } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import { useRouter } from 'next/navigation'

export default function RealtimeLeadAlert() {
  const router = useRouter()
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    )

    const channel = supabase
      .channel('dispatch-leads')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'leads' },
        (payload) => {
          const lead = payload.new as { vorname?: string; nachname?: string; telefon?: string }

          // Desktop Notification
          if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('Neuer Lead!', {
              body: `${lead.vorname ?? ''} ${lead.nachname ?? ''} — ${lead.telefon ?? ''}`,
              icon: '/favicon.ico',
            })
          }

          // Sound beep
          try {
            if (!audioRef.current) {
              audioRef.current = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2JkZaXl5eUkIyHg39zcGhrcHZ8g4mNj5CPjouHg395c25rb3R5fYKGiYuMjIuJhoN/e3dzcG5vc3d7f4OHiouLi4mHhIF+endzcG5uc3h8gISHiYuLiomGg4B9eXVxbm5xdXl9gYWIiouKiYeFgn95dnJvbm9ydnp+goaJi4uKiIWCf3x4dHBub3J2en6Ch4mLi4qIhYJ/e3h0cG5vcnZ6foKGiYuLioiFgn98eHRwbm9ydnp+goaJi4uKiIWCf3t4dHBub3J2en6BhYiKiomHhIF+e3dzcG5vcnZ7f4OHiouLiYeEgX56dnJvbnBydn')
            }
            audioRef.current.play().catch(() => {})
          } catch { /* Audio optional */ }

          // Refresh
          router.refresh()
        },
      )
      .subscribe()

    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission()
    }

    return () => { supabase.removeChannel(channel) }
  }, [router])

  return null
}
