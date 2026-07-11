'use client'

// Aufgaben-Pill-Leiste. Nutzt das geteilte Chip-Primitive (@/components/ui/Chip) —
// dieselbe Pille wie die Vertrieb-Konsole (VertriebPillBar), hier route-basiert via
// Chip `href` (rendert intern <Link>). Reine Pill-Logik (PILLS/pillActive) liegt in
// ./aufgaben-pills (React-frei, unit-testbar).
import { Chip } from '@/components/ui/Chip'
import { AdminAiVorschlaegeBadge } from '@/components/admin/AdminAiVorschlaegeBadge'
import { PILLS, pillActive } from './aufgaben-pills'

export function AufgabenPills({ activePath }: { activePath: string }) {
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Aufgaben-Bereiche">
      {PILLS.map((p) => {
        const active = pillActive(activePath, p.href)
        return (
          <Chip
            key={p.href}
            href={p.href}
            size="sm"
            variant={active ? 'selected' : 'ghost'}
            aria-current={active ? 'page' : undefined}
          >
            {p.label}
            {p.badge === 'vorschlaege' && <AdminAiVorschlaegeBadge variant="counter" />}
          </Chip>
        )
      })}
    </nav>
  )
}
