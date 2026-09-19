import { describe, it, expect } from 'vitest'
import { tier2FreigabeErlaubt } from '../tier2-docs'

// 19.09.2026 (Aaron): Die Frist-Mechanik (berechneTier2Patch) und das dokumentgebundene
// Siegel (berechneVerifiziertPatch, sindTier2DocsGeprueft) sind abgeschafft — „ich möchte
// nicht mehr verifizieren und … nicht mehr nachhalten müssen, ob die Dokumente fehlen".
// Die Freischaltung läuft über EINEN Patch (src/lib/sv/freischaltung.ts). Übrig bleibt der
// Anti-Bypass-Guard des optionalen Admin-Knopfs „Tier-2 als geprüft markieren".

describe('tier2FreigabeErlaubt', () => {
  it('true wenn beide hochgeladen oder geprueft', () => {
    expect(
      tier2FreigabeErlaubt([
        { dokument_typ: 'sv_berufshaftpflicht', status: 'hochgeladen' },
        { dokument_typ: 'sv_gewerbeanmeldung', status: 'geprueft' },
      ]),
    ).toBe(true)
  })
  it('false wenn ein Slot noch ausstehend', () => {
    expect(
      tier2FreigabeErlaubt([
        { dokument_typ: 'sv_berufshaftpflicht', status: 'hochgeladen' },
        { dokument_typ: 'sv_gewerbeanmeldung', status: 'ausstehend' },
      ]),
    ).toBe(false)
  })
  it('false wenn ein Slot ganz fehlt', () => {
    expect(tier2FreigabeErlaubt([{ dokument_typ: 'sv_berufshaftpflicht', status: 'geprueft' }])).toBe(false)
  })
})
