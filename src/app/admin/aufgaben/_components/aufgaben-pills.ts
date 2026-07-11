// Reine Pill-Logik der Aufgaben-Fläche — KEIN React/Next-Import, direkt unit-testbar
// (vitest environment='node'). Die Darstellung (Chip-Pills) liegt in AufgabenPills.tsx.

export type AufgabenPill = { href: string; label: string; badge?: 'vorschlaege' }

export const PILLS: AufgabenPill[] = [
  { href: '/admin/aufgaben/vorschlaege', label: 'KI-Vorschläge', badge: 'vorschlaege' },
  { href: '/admin/aufgaben/alle', label: 'Alle Aufgaben' },
  { href: '/admin/aufgaben/meine', label: 'Meine Aufgaben' },
]

/** Aktiv, wenn activePath die href exakt trifft oder eine Sub-Route davon ist. */
export function pillActive(activePath: string, href: string): boolean {
  return activePath === href || activePath.startsWith(href + '/')
}
