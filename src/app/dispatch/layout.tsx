import DispatchNav from './_components/DispatchNav'
import RealtimeLeadAlert from './_components/RealtimeLeadAlert'
import { PageContainer } from '@/components/PageContainer'
import UpdatesNav from '@/components/shared/updates'
import GlobalSearch from '@/components/shared/search/GlobalSearch'
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
    <>
    <div className="h-screen bg-claimondo-bg relative overflow-hidden">
      <RealtimeLeadAlert />
      <GlobalSearch rolle="dispatch" />
      <DispatchNav email={user.email ?? ''} initials={initials} userId={user.id} />

      {/* Content full-bleed (PageContainer fullBleed); md:pl-56 raeumt das fixe
          Glass-Panel frei (kein Kollidieren dahinter). BG bleedt unter das Panel,
          Content laeuft rechts bis zur Kante. */}
      <div className="md:pl-56 h-screen flex flex-col relative z-10">
        {/* Mobile-Nav ist bottom-only (MobileNav-Pille + Menü-Sheet inkl. Updates) — kein Top-Bar. */}

        {/* AAR-725: UpdatesNav desktop top-right. */}
        <div className="hidden md:flex items-center gap-2 fixed top-3 right-4 z-30">
          <UpdatesNav variant="light" />
        </div>

        {/* AAR-911 v2: Statt md:pr-36 die VOLLE Main-Höhe für die fixe Corner-Pill
            zu opfern (144px tote Spalte), hält `.has-corner-pill` (globals.css) nur
            die PageHeader-Action-Zeile rechts frei — Body-Content (Tabellen/Grids)
            gewinnt die 144px Breite zurück. */}
        <main id="main-content" role="main" className="flex-1 min-h-0 overflow-y-auto pb-16 md:pb-0 has-corner-pill">
          <PageContainer fullBleed className="h-full">{children}</PageContainer>
        </main>
      </div>
    </div>
    </>
  )
}
