import DispatchNav from './_components/DispatchNav'
import RealtimeLeadAlert from './_components/RealtimeLeadAlert'
import { PageContainer } from '@/components/PageContainer'
import UpdatesNav from '@/components/shared/updates'
import { requirePortalAccess } from '@/lib/auth/portal-guard'
import { PortalShell } from '@/components/shared/portal-shell'

export default async function DispatchLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // K5: Auth + Rollen-Guard zentralisiert. Dispatch erlaubt Admin als
  // Testing-Fallback weiterhin.
  const { user, initials } = await requirePortalAccess(['dispatch', 'admin'])

  return (
    <>
      <RealtimeLeadAlert />
      <PortalShell
        breakpoint="md"
        contentOffsetClass="md:pl-56"
        mobileNav="shell-drawer"
        sidebar={<DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />}
        mobileHeader={
          <>
            <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-claimondo-light-blue">ondo</span></span>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-[10px] uppercase tracking-wider text-claimondo-light-blue bg-claimondo-shield px-2 py-0.5 rounded-ios-sm">Dispatch</span>
              <UpdatesNav variant="dark" />
            </div>
          </>
        }
        desktopTopRight={
          <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
            <UpdatesNav variant="light" />
          </div>
        }
        contentClassName="has-corner-pill pb-16 md:pb-0"
      >
        <PageContainer className="h-full">{children}</PageContainer>
      </PortalShell>
    </>
  )
}
