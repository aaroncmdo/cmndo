// Server Component — 3 Tab-Links (Feed/Verbindungen/Anfragen), aktiver Tab hervorgehoben.
// Kein Status-Farb-Map/Ternary (die Ternary gated auf `active` — kein Domain-Status-Feld —
// daher ausserhalb des Status-Registry-Ratchets, der auf status/phase/state-benannte
// Variablen anschlaegt).
import Link from 'next/link'
import type { NetzwerkPortal } from '@/components/shared/netzwerk/types'
import { NETZWERK_HREF } from '@/components/shared/netzwerk/types'
import type { NetzwerkTab } from './tab'

const TABS: { key: NetzwerkTab; label: string }[] = [
  { key: 'feed', label: 'Feed' },
  { key: 'verbindungen', label: 'Verbindungen' },
  { key: 'anfragen', label: 'Anfragen' },
]

export function NetzwerkTabBar({ portal, active }: { portal: NetzwerkPortal; active: NetzwerkTab }) {
  const base = NETZWERK_HREF[portal]
  return (
    <nav className="flex gap-1 border-b border-claimondo-border" aria-label="Netzwerk-Tabs">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.key === 'feed' ? base : `${base}?tab=${t.key}`}
          className={`px-4 py-2 text-body-sm font-medium border-b-2 -mb-px ${
            active === t.key
              ? 'border-claimondo-ondo text-claimondo-navy'
              : 'border-transparent text-claimondo-shield hover:text-claimondo-navy'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  )
}
