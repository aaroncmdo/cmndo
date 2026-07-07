'use client'

// Bug B Sicherheitsnetz (Marketing-Login-Persistenz, 2026-07-07):
// Wenn der Server die Seite als "ausgeloggt" gerendert hat (SSR-Session veraltet),
// der Browser aber eine gueltige Session haelt, wird EINMALIG router.refresh()
// ausgeloest -> die RSC laeuft erneut, die (Locale-)Middleware refresht die Session
// (refreshSession) -> getAuthState sieht den User -> korrekte Props fuer Formular/
// Composer. Ergaenzt den serverseitigen Fix (A): fuer den seltenen Fall, dass die
// erste SSR-Render-Session noch nicht refresht war, korrigiert der Client-Check.
//
// Rendert null. Der one-shot-Guard (`done`) verhindert jeden Refresh-Loop, falls
// die Session in Wahrheit ungueltig ist (dann bleibt es beim ausgeloggten Zustand).

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export function SessionSync({ loggedIn }: { loggedIn: boolean }) {
  const router = useRouter()
  const done = useRef(false)

  useEffect(() => {
    if (loggedIn || done.current) return // Server sah bereits eingeloggt -> nichts zu tun
    done.current = true // nur EIN Versuch -> kein Refresh-Loop bei echt-ausgeloggt
    const supabase = createClient()
    supabase.auth
      .getSession()
      .then(({ data: { session } }) => {
        if (session?.user) router.refresh()
      })
      .catch(() => {})
  }, [loggedIn, router])

  return null
}
