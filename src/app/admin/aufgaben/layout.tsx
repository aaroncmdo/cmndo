'use client'

// AAR-531 (A2b): Aufgaben-Hub Layout — Tab-Nav für Meine Tasks + Alle Tasks.

import Link from 'next/link'
import { usePathname } from 'next/navigation'

export default function AufgabenLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()

  const tabs = [
    { href: '/admin/aufgaben/meine', label: 'Meine Tasks' },
    { href: '/admin/aufgaben/alle', label: 'Alle Tasks' },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 border-b border-claimondo-border bg-white px-4 md:px-6">
        <nav className="flex gap-0" aria-label="Aufgaben-Tabs">
          {tabs.map((tab) => {
            const active = pathname === tab.href || pathname?.startsWith(tab.href + '/')
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  active
                    ? 'border-[#0D1B3E] text-[#0D1B3E]'
                    : 'border-transparent text-claimondo-ondo hover:text-claimondo-navy hover:border-claimondo-border'
                }`}
              >
                {tab.label}
              </Link>
            )
          })}
        </nav>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
