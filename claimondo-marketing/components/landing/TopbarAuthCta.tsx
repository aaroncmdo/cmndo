'use client'

// Marketing-Login-Persistenz (2026-07-07): Client-seitige Hydration des Login-
// Status in der Topbar. Der server-`LandingTopbar` uebergibt `initialUser` — auf
// der Startseite server-aufgeloest (kein Flash). Auf ~30 Content-/Wissens-Seiten
// wird die Topbar hart mit authenticatedUser={null} gerendert (SSR bleibt so
// Crawler-/SEO-/Static-neutral). Dort liest dieses Component nach dem Mount die
// Browser-Session (.claimondo.de-Cookie) und schaltet den CTA auf „Zu meinem
// Portal" — ein eingeloggter Nutzer sieht dann nicht mehr faelschlich „Anmelden".

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { LoginEmbed } from '@/components/shared/LoginEmbed'
import { createClient } from '@/lib/supabase/client'
import { roleToPath } from '@/lib/auth/role-redirect'
import type { AuthenticatedUser } from './LandingTopbar'

type Props = {
  /** Server-aufgeloester User (Startseite) – null auf Content-Seiten. */
  initialUser: AuthenticatedUser | null
  portalLabel: string
  portalLabelShort: string
  portalCtaClassName: string
  loginTriggerClassName: string
}

export function TopbarAuthCta({
  initialUser,
  portalLabel,
  portalLabelShort,
  portalCtaClassName,
  loginTriggerClassName,
}: Props) {
  const [user, setUser] = useState<AuthenticatedUser | null>(initialUser)

  useEffect(() => {
    // Startseite hat den User schon server-aufgeloest → kein Client-Fetch, kein Flash.
    if (initialUser) return
    let cancelled = false
    const supabase = createClient()
    // getSession() liest lokal (Cookie/Storage, kein GoTrue-Roundtrip) — reicht als CTA-Hint.
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (cancelled || !session?.user) return
        const { data: profile } = await supabase
          .from('profiles')
          .select('rolle, anzeigename')
          .eq('id', session.user.id)
          .single()
        if (cancelled) return
        setUser({
          portalPath: roleToPath((profile?.rolle as string | null | undefined) ?? null),
          displayName:
            (profile?.anzeigename as string | null | undefined) ||
            session.user.email ||
            'Mein Portal',
        })
      })
      .catch(() => {
        // Kein valider Session-Zustand → anonymer CTA bleibt (kein Bruch).
      })
    return () => {
      cancelled = true
    }
  }, [initialUser])

  if (user) {
    return (
      <Link href={user.portalPath} className={portalCtaClassName}>
        <span className="hidden sm:inline">{portalLabel}</span>
        <span className="sm:hidden">{portalLabelShort}</span>
        <span aria-hidden="true" className="transition-transform group-hover:translate-x-0.5">
          →
        </span>
      </Link>
    )
  }

  return <LoginEmbed triggerClassName={loginTriggerClassName} />
}
