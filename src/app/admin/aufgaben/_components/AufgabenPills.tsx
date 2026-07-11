'use client'

import Link from 'next/link'
import { AdminAiVorschlaegeBadge } from '@/components/admin/AdminAiVorschlaegeBadge'

type Pill = { href: string; label: string; badge?: 'vorschlaege' }

export const PILLS: Pill[] = [
  { href: '/admin/aufgaben/vorschlaege', label: 'KI-Vorschläge', badge: 'vorschlaege' },
  { href: '/admin/aufgaben/alle', label: 'Alle Aufgaben' },
  { href: '/admin/aufgaben/meine', label: 'Meine Aufgaben' },
]

// Pure — direkt unit-testbar (environment='node', kein Render nötig).
export function pillActive(activePath: string, href: string): boolean {
  return activePath === href || activePath.startsWith(href + '/')
}

export function AufgabenPills({ activePath }: { activePath: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Aufgaben-Bereiche">
      {PILLS.map((p) => {
        const active = pillActive(activePath, p.href)
        return (
          <Link
            key={p.href}
            href={p.href}
            aria-current={active ? 'page' : undefined}
            className={`inline-flex items-center gap-1.5 rounded-ios-lg px-3.5 py-1.5 text-body-sm font-medium transition-colors ${
              active
                ? 'bg-claimondo-navy text-white'
                : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
            }`}
          >
            {p.label}
            {p.badge === 'vorschlaege' && (
              <AdminAiVorschlaegeBadge variant="counter" />
            )}
          </Link>
        )
      })}
    </nav>
  )
}
