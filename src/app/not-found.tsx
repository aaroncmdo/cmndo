import { createClient } from '@/lib/supabase/server'
import EmptyState from '@/components/shared/EmptyState'

// AAR-649: Rolle-basierter Fallback-Link. Admin/Dispatch/KB/SV/Makler
// werden auf ihr jeweiliges Dashboard geleitet statt auf /, damit ein 404
// (z.B. gelöschter Fall-Link im Wichtige-Updates-Widget) nicht den Session-
// Kontext verliert. Nicht-eingeloggte User landen weiter auf /.
//
// AAR-807: Auf shared EmptyState migriert; „404"-Hero bleibt als dekorativer
// Block über der Card.

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
      <div className="max-w-md w-full">
        <div className="text-center text-claimondo-ondo/50 text-7xl font-bold mb-4">404</div>
        <EmptyState
          title="Seite nicht gefunden"
          description="Die angeforderte Seite existiert nicht oder wurde verschoben."
          action={{ label: home.label, href: home.href, variant: 'secondary' }}
        />
      </div>
    </div>
  )
}
