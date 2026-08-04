'use client'

// C4d/e (Fundament „Eine Akte"): der 'tabs'-Layout-Modus — 3-Spalten (aside/main/sidebar) +
// Client-Tab-Controller (activeTab-State + ?tab=-URL-Sync). Anders als columns/stack rendert nur
// EINE Zone (der aktive Tab); die Tab-Inhalte kommen VORGERENDERT via config.tabContent (heterogene
// Props je Tab -> vorrendern statt zones(vm), das eine Prop-Buendelung erzwaenge). Staff nutzt es
// (Admin/Kanzlei/KB/Dispatch, rollen-adaptiv). Der FallProvider wrappt <FallAkte> im Adapter, daher
// haben die Tab-Inhalte Fall-Context. Client-Component (DECISIONS 2026-07-31 · C4: Client-Zonen).

import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import FallRealtimeRefresh from '@/components/fall/FallRealtimeRefresh'
import PageHeader from '@/components/shared/PageHeader'
import { FallakteTabs as FallakteTabsBar } from '@/components/shared/fall-tabs'
import { TabDropContent } from '@/components/ui/TabDropContent'
import type { FallAkteConfig } from '../types'

export function FallAkteTabs<Vm, ZK extends string>(
  { config, vm }: { config: FallAkteConfig<Vm, ZK>; vm: Vm },
) {
  const tabs = config.tabs ?? []
  const tabContent = config.tabContent ?? {}
  const header = config.header(vm)
  const realtime = config.realtime?.(vm) ?? null
  const slots = config.slots?.(vm) ?? {}

  const router = useRouter()
  const search = useSearchParams()
  const firstId = tabs[0]?.id ?? ''
  const tabParam = search.get('tab') ?? firstId
  const [activeTab, setActiveTabState] = useState<string>(
    tabs.some((t) => t.id === tabParam) ? tabParam : firstId,
  )

  function setActiveTab(id: string) {
    setActiveTabState(id)
    // URL-Param-Sync — Zurueck-Button + Deep-Links funktionieren dadurch.
    const params = new URLSearchParams(search?.toString() ?? '')
    params.set('tab', id)
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  return (
    <>
      {realtime && <FallRealtimeRefresh fallId={realtime.fallId} claimId={realtime.claimId} />}
      <div className="flex flex-col lg:flex-row lg:h-[calc(100vh-96px)] gap-0">
        {/* Linke Spalte — aside (Staff: FallPhasenPanel). */}
        {slots.aside && (
          <aside className="lg:w-72 xl:w-80 shrink-0 overflow-y-auto">
            <div className="px-4 py-4">{slots.aside}</div>
          </aside>
        )}

        {/* Haupt-Column: Banner + Header + Tab-Bar + aktiver Tab-Inhalt. */}
        <main className="flex-1 overflow-y-auto min-w-0">
          {slots.topBlocks}
          {'custom' in header ? (
            header.custom
          ) : (
            <div className="px-4 sm:px-6 pt-4">
              <PageHeader title={header.title} description={header.description || undefined} />
              {header.badges}
            </div>
          )}
          <FallakteTabsBar
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            rightSlot={config.tabRightSlot}
          />
          <TabDropContent tabKey={activeTab} className="px-4 sm:px-6 py-6">
            {tabContent[activeTab]}
          </TabDropContent>
        </main>

        {/* Rechte Spalte — sidebar (Staff: FallSidebar; bringt eigenen Container mit). */}
        {slots.sidebar}
      </div>
    </>
  )
}
