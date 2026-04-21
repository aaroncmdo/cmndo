import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'

// AAR-649: Rolle-basierter Fallback-Link. Admin/Dispatch/KB/SV/Makler
// werden auf ihr jeweiliges Dashboard geleitet statt auf /, damit ein 404
// (z.B. gelöschter Fall-Link im Wichtige-Updates-Widget) nicht den Session-
// Kontext verliert. Nicht-eingeloggte User landen weiter auf /.

const ROLE_HOME: Record<string, { href: string; label: string }> = {
  admin: { href: '/admin', label: 'Zum Admin-Dashboard' },
  dispatch: { href: '/dispatch/dashboard', label: 'Zum Dispatch-Dashboard' },
  kundenbetreuer: { href: '/mitarbeiter', label: 'Zum Mitarbeiter-Portal' },
  sachverstaendiger: { href: '/gutachter', label: 'Zum Gutachter-Portal' },
  kunde: { href: '/kunde', label: 'Zum Kunden-Portal' },
  makler: { href: '/makler', label: 'Zum Makler-Portal' },
}

export default async function NotFound() {
  const supabase = await createClient()
  const { data } = await supabase.auth.getUser()
  const user = data?.user ?? null

  let home = { href: '/', label: 'Zur Startseite' }
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
    const rolle = profile?.rolle as string | undefined
    if (rolle && ROLE_HOME[rolle]) home = ROLE_HOME[rolle]
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center px-5">
      <div className="text-center max-w-md">
        <div className="text-gray-300 text-7xl font-bold mb-4">404</div>
        <h1 className="text-xl font-semibold text-gray-900 mb-2">
          Seite nicht gefunden
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Die angeforderte Seite existiert nicht oder wurde verschoben.
        </p>
        <Link
          href={home.href}
          className="inline-block px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-800 text-sm font-medium rounded-xl transition-colors"
        >
          {home.label}
        </Link>
      </div>
    </div>
  )
}
