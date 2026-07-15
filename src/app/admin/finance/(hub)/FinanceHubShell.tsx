'use client'
import { useState } from 'react'
import type { ReactNode } from 'react'
import PageHeader from '@/components/shared/PageHeader'

export type FinanceTab = { id: string; label: string }

type Props = {
  tabs: FinanceTab[]
  defaultTab: string
  title: string
  description?: string
  actions?: ReactNode
  views: Record<string, ReactNode>
}

export default function FinanceHubShell({ tabs, defaultTab, title, description, actions, views }: Props) {
  const [active, setActive] = useState(defaultTab)
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
                  onClick={() => setActive(t.id)}
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
