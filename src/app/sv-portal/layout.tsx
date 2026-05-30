// AAR-939 · Monika-Embed · Stream 6 — SV-Self-Service-Portal Layout.
//
// Eigene Top-Level-Route-Gruppe (parallel zu /gutachter, /dispatch). Auth via
// requirePortalAccess(['sachverstaendiger','admin']) — admin als Test-Fallback.
// KEIN portal_zugang_freigeschaltet-Gate: Embed-Self-Service ist unabhaengig vom
// Cockpit-Onboarding.

import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { PageContainer } from '@/components/PageContainer'
import SVPortalShell from './SVPortalShell'

export const dynamic = 'force-dynamic'

export default async function SVPortalLayout({ children }: { children: React.ReactNode }) {
  const { user, initials } = await requirePortalAccess(['sachverstaendiger', 'admin'])

  return (
    <div className="h-screen bg-claimondo-bg relative overflow-hidden">
      <SVPortalShell email={user.email ?? ''} initials={initials} />
      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
