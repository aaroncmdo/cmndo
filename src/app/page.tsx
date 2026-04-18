import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { roleToPath } from '@/lib/auth/role-redirect'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { LandingPage } from '@/components/landing/LandingPage'
import type { AuthenticatedUser } from '@/components/landing/LandingTopbar'

// AAR-462 F4: Smart-Root ist jetzt die öffentliche Landing-Page.
// Vorher war `/` ein Hard-Redirect in das Portal der eingeloggten Rolle
// (AAR-361). Das blockierte Marketing, SEO und das Teilen der Startseite.
//
// Neue Logik:
//   • Anonyme User sehen die Landing-Page mit „Anmelden"-CTA.
//   • Eingeloggte User sehen DIESELBE Landing-Page — aber der CTA in der
//     Topbar wird zu „Zu meinem Portal →" (rollen-spezifisch via roleToPath).
//   • Kein Auto-Redirect mehr, damit eingeloggte User die Marketing-Seite
//     bewusst ansteuern und teilen können.

export const metadata: Metadata = {
  title: 'Claimondo — Ihr KFZ-Schaden, digital geregelt',
  description:
    'Claimondo übernimmt Ihren Unfallschaden komplett: Gutachten, Werkstatt, Anwalt und Auszahlung — transparent und unabhängig von der gegnerischen Versicherung.',
  openGraph: {
    title: 'Claimondo — Ihr KFZ-Schaden, digital geregelt',
    description:
      'Unabhängige Schadensregulierung nach Kfz-Unfällen. Gutachten, Werkstatt, Anwalt und Auszahlung aus einer Hand.',
    type: 'website',
    locale: 'de_DE',
    siteName: 'Claimondo',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Claimondo — Ihr KFZ-Schaden, digital geregelt',
    description:
      'Unabhängige Schadensregulierung nach Kfz-Unfällen. Gutachten, Werkstatt, Anwalt und Auszahlung aus einer Hand.',
  },
}

export default async function Home() {
  const locale = await getLocaleCookie()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  let authenticatedUser: AuthenticatedUser | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('rolle, anzeigename')
      .eq('id', user.id)
      .single()

    authenticatedUser = {
      portalPath: roleToPath(profile?.rolle as string | null | undefined),
      displayName:
        (profile?.anzeigename as string | null | undefined) ||
        user.email ||
        'Mein Portal',
    }
  }

  return (
    <LandingPage authenticatedUser={authenticatedUser} locale={locale} />
  )
}
