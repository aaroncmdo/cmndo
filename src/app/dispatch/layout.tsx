import DispatchNav from './_components/DispatchNav'
import RealtimeLeadAlert from './_components/RealtimeLeadAlert'
import { PageContainer } from '@/components/PageContainer'
import UpdatesNav from '@/components/shared/updates'
import { requirePortalAccess } from '@/lib/auth/portal-guard'

export default async function DispatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5: Auth + Rollen-Guard zentralisiert. Dispatch erlaubt Admin als
  // Testing-Fallback weiterhin.
  const { user, initials } = await requirePortalAccess(['dispatch', 'admin'])

  return (
    <div className="h-screen relative overflow-hidden" style={{ background: '#f2f3f7' }}>
      {/* Atmosphärische Hintergrund-Spotlights — identisch mit Admin-Layout */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
        <div className="absolute inset-0" style={{
          background: [
            'radial-gradient(65% 55% at 85% 0%, rgba(123,163,204,.10), transparent 65%)',
            'radial-gradient(55% 65% at 0% 100%, rgba(69,115,162,.06), transparent 70%)',
          ].join(', '),
        }} />
      </div>
      <RealtimeLeadAlert />
      <DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />

      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile header — AAR-727 Glass-Dark */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 glass-dark shadow-ios-md shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield px-2 py-0.5 rounded-ios-sm">Dispatch</span>
            <UpdatesNav variant="dark" />
          </div>
        </header>

        {/* AAR-725: UpdatesNav desktop top-right. */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <UpdatesNav variant="light" />
        </div>

        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0">
          <PageContainer className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
  )
}
