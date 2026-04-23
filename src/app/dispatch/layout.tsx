import DispatchNav from './_components/DispatchNav'
import RealtimeLeadAlert from './_components/RealtimeLeadAlert'
import { PageContainer } from '@/components/PageContainer'
import UpdatesNav from '@/components/updates/UpdatesNav'
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
    <div className="h-screen bg-[#f8f9fb] relative overflow-hidden">
      <RealtimeLeadAlert />
      <DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />

      <div className="md:ml-56 h-screen flex flex-col relative z-10">
        {/* Mobile header */}
        <header className="md:hidden flex items-center justify-between px-4 py-3 bg-[#0D1B3E] shrink-0">
          <span className="text-lg font-bold tracking-tight"><span className="text-white">Claim</span><span className="text-[#7BA3CC]">ondo</span></span>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[#7BA3CC] bg-[#1E3A5F] px-2 py-0.5 rounded">Dispatch</span>
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
