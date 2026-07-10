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
  // K5: Auth + Rollen-Guard zentralisiert. Dispatch erlaubt Admin als Testing-Fallback.
  const { user, initials } = await requirePortalAccess(['dispatch', 'admin'])

  return (
    <>
    {/* SV-Komposition: durchgehender Navy-Canvas (md:bg-claimondo-navy) + schwebende
        Glas-Sidebar + schwebende Content-Karte (siehe admin/layout). */}
    <div className="h-screen bg-claimondo-bg md:bg-claimondo-navy relative overflow-hidden">
      <RealtimeLeadAlert />
      <DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />

      {/* md:pl-60 = Gap zur fixed Glas-Sidebar; md:py-4/md:pr-4 = Navy-Rand. */}
      <div className="md:pl-60 md:py-4 md:pr-4 h-screen flex flex-col relative z-10">
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

        {/* Content-Karte auf dem Navy-Canvas. */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-hidden pb-16 md:pb-0 has-corner-pill">
          <div className="h-full overflow-y-auto md:rounded-ios-lg md:bg-claimondo-bg md:shadow-ios-lg">
            <PageContainer fullBleed className="min-h-full">{children}</PageContainer>
          </div>
        </main>
      </div>
    </div>
    </>
  )
}
