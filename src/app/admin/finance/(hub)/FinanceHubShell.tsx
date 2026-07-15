'use client'
import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'

export type FinanceTab = { id: string; label: string }

type Props = {
  tabs: FinanceTab[]
  /** Fallback-Tab + der Tab, bei dem die URL KEIN ?tab= traegt (Default-Ansicht). */
  defaultTab: string
  /** Vom Server aus ?tab= aufgeloest (Deep-Link / Redirect-Stub). Setzt nur den Start-Tab. */
  initialTab: string
  title: string
  description?: string
  actions?: ReactNode
  views: Record<string, ReactNode>
}

export default function FinanceHubShell({
  tabs,
  defaultTab,
  initialTab,
  title,
  description,
  actions,
  views,
}: Props) {
  const [active, setActive] = useState(initialTab)

  // Tab-Wahl in die URL spiegeln (deep-linkbar + Browser-Back) OHNE Next-Navigation:
  // history.pushState triggert KEIN RSC-Refetch, d.h. die 8 server-gerenderten Views
  // bleiben client-seitig instant umschaltbar (kein erneutes Server-Fetch pro Klick).
  // Der Deep-Link-Einstieg (Stub-Redirect -> ?tab=<sub>) laeuft ueber initialTab (Server).
  function selectTab(id: string) {
    setActive(id)
    const search = id === defaultTab ? '' : `?tab=${id}`
    window.history.pushState(null, '', `${window.location.pathname}${search}`)
  }

  // Browser-Back/Forward: aktiven Tab aus der URL nachziehen.
  useEffect(() => {
    const resolve = (t: string | null) => (tabs.some((x) => x.id === t) ? (t as string) : defaultTab)
    const onPop = () => setActive(resolve(new URLSearchParams(window.location.search).get('tab')))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [tabs, defaultTab])

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 pt-4 flex-shrink-0">
        <PageHeader title={title} description={description} actions={actions}>
          <nav className="flex gap-1 overflow-x-auto" aria-label="Finanzen-Ansichten">
            {tabs.map((t) => {
              const on = active === t.id
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTab(t.id)}
                  aria-current={on ? 'page' : undefined}
                  className={`px-3.5 py-2 text-sm rounded-ios-lg whitespace-nowrap transition-colors ${
                    on
                      ? 'bg-claimondo-ondo/10 text-claimondo-navy font-semibold ring-1 ring-claimondo-ondo/20'
                      : 'text-claimondo-ondo hover:text-claimondo-navy hover:bg-claimondo-bg font-medium'
                  }`}
                >
                  {t.label}
                </button>
              )
            })}
          </nav>
        </PageHeader>
      </div>
      <div className="flex-1 overflow-y-auto">
        {tabs.map((t) => (
          <div key={t.id} className={active === t.id ? '' : 'hidden'}>
            {views[t.id]}
          </div>
        ))}
      </div>
    </div>
  )
}
