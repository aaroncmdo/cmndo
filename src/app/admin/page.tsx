import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import KritischeUpdatesWidget from './_components/KritischeUpdatesWidget'
import KpiCards from './_components/KpiCards'
import AusstehendeZahlungenWidget from './_components/AusstehendeZahlungenWidget'
import WichtigeUpdatesWidget from './_components/WichtigeUpdatesWidget'
import DashboardStats from './_components/DashboardStats'
import TageskalenderWidget from './_components/TageskalenderWidget'
import LoadingSkeleton from '@/components/shared/LoadingSkeleton'

// KFZ-155: Admin-Dashboard Rework — komplett überarbeitet.
// AAR-414: WidgetSkeleton auf <LoadingSkeleton variant="block" /> migriert
//
// 4-Row Layout (oben nach unten, füllt den ganzen Viewport):
//   Row 1 (conditional): Kritische Updates rote Box, full-width
//   Row 2: 4 KPI-Cards
//   Row 3: Ausstehende Zahlungen (links) + Wichtige Updates (rechts)
//   Row 4: Lead-Konversion + Umsatz-Verlauf (Charts/Stats)
//
// Alle Widgets sind Server-Components mit eigenen Daten-Fetches und in
// <Suspense> gewrapped, sodass die einzelnen Boxen unabhängig laden.

function WidgetSkeleton({ height = 'h-48' }: { height?: string }) {
  return <LoadingSkeleton variant="block" height={height} />
}

export default async function AdminDashboardPage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  return (
    <div className="h-full overflow-y-auto bg-[#f8f9fb]">
      <div className="py-5 space-y-4 min-h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="text-xl font-semibold text-claimondo-navy">Dashboard</h1>
            <p className="text-xs text-claimondo-ondo">Live-Steuerung &amp; Tagesueberblick</p>
          </div>
        </div>

        {/* Row 1: Kritische Updates (conditional, voll-breit) */}
        <Suspense fallback={<WidgetSkeleton height="h-20" />}>
          <KritischeUpdatesWidget />
        </Suspense>

        {/* Row 2: 4 KPI-Cards */}
        <Suspense
          fallback={
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
              <WidgetSkeleton height="h-24" />
              <WidgetSkeleton height="h-24" />
              <WidgetSkeleton height="h-24" />
              <WidgetSkeleton height="h-24" />
              <WidgetSkeleton height="h-24" />
            </div>
          }
        >
          <KpiCards />
        </Suspense>

        {/* Row 3: Tageskalender + Wichtige Updates + Zahlungen */}
        <Suspense fallback={<WidgetSkeleton height="h-48" />}>
          <TageskalenderWidget />
        </Suspense>

        {/* Row 4: Ausstehende Zahlungen + Wichtige Updates (split) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 flex-1 min-h-[360px]">
          <Suspense fallback={<WidgetSkeleton height="h-full" />}>
            <AusstehendeZahlungenWidget />
          </Suspense>
          <Suspense fallback={<WidgetSkeleton height="h-full" />}>
            <WichtigeUpdatesWidget />
          </Suspense>
        </div>

        {/* Row 4: Charts/Stats — fuellt den Rest des Viewports */}
        <div className="min-h-[200px]">
          <Suspense
            fallback={
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <WidgetSkeleton height="h-48" />
                <WidgetSkeleton height="h-48" />
              </div>
            }
          >
            <DashboardStats />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
