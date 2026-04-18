import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { roleToPath } from '@/lib/auth/role-redirect'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { hashIp } from '@/lib/crypto/hash-ip'
import { LandingPage } from '@/components/landing/LandingPage'
import type { AuthenticatedUser } from '@/components/landing/LandingTopbar'

// AAR-491 (M9): Promo-Click-Tracking direkt im Server-Component der
// Landing-Seite. Fire-and-forget — darf Render nicht verzögern, Fehler
// werden stillschweigend gefressen.
const PROMO_CODE_RE = /^MK-[A-Z0-9]{4,12}$/i

async function trackPromoClick(code: string): Promise<void> {
  try {
    const normalized = code.trim().toUpperCase()
    if (!PROMO_CODE_RE.test(normalized)) return
    const admin = createAdminClient()
    const { data: pc } = await admin
      .from('promotion_codes')
      .select('id, aktiv')
      .eq('code', normalized)
      .maybeSingle()
    if (!pc || !pc.aktiv) return
    const h = await headers()
    await admin.from('promo_clicks').insert({
      promotion_code_id: pc.id as string,
      user_agent: h.get('user-agent')?.slice(0, 500) ?? null,
      referer: h.get('referer')?.slice(0, 500) ?? null,
      ip_hash: hashIp(h.get('x-forwarded-for') ?? h.get('x-real-ip')),
    })
  } catch {
    // fire-and-forget — Tracking darf UX nicht brechen
  }
}

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

type HomeProps = {
  searchParams?: Promise<{ p?: string }>
}

export default async function Home({ searchParams }: HomeProps = {}) {
  const params = (await searchParams) ?? {}
  if (params.p) {
    await trackPromoClick(params.p)
  }

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
