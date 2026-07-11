import { describe, it, expect, vi } from 'vitest'

// AufgabenPills.tsx importiert AdminAiVorschlaegeBadge (self-fetch via Server-Action) transitiv.
// Im environment='node'-Test stubben wir den Badge, damit der PILLS/pillActive-Import stabil
// bleibt und nicht bricht, falls der Badge kuenftig Browser-/Next-only-Deps zieht.
vi.mock('@/components/admin/AdminAiVorschlaegeBadge', () => ({ AdminAiVorschlaegeBadge: () => null }))

import { PILLS, pillActive } from './AufgabenPills'

// environment='node' (kein jsdom / keine testing-library): reine Logik testen, kein Render.
describe('AufgabenPills-Logik', () => {
  it('PILLS hat 3 Einträge mit korrekten hrefs + Labels', () => {
    expect(PILLS.map((p) => p.href)).toEqual([
      '/admin/aufgaben/vorschlaege',
      '/admin/aufgaben/alle',
      '/admin/aufgaben/meine',
    ])
    expect(PILLS.map((p) => p.label)).toEqual(['KI-Vorschläge', 'Alle Aufgaben', 'Meine Aufgaben'])
  })
  it('pillActive: exakte Route ist aktiv', () => {
    expect(pillActive('/admin/aufgaben/vorschlaege', '/admin/aufgaben/vorschlaege')).toBe(true)
  })
  it('pillActive: fremde Route ist nicht aktiv', () => {
    expect(pillActive('/admin/aufgaben/alle', '/admin/aufgaben/vorschlaege')).toBe(false)
  })
  it('pillActive: Sub-Pfad matcht per Präfix', () => {
    expect(pillActive('/admin/aufgaben/alle/detail', '/admin/aufgaben/alle')).toBe(true)
  })
})
