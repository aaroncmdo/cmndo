import { describe, it, expect } from 'vitest'
import { metaDescriptionFromSnippet } from '../claimondo-mdx'

describe('metaDescriptionFromSnippet', () => {
  it('gibt kurze Snippets unveraendert zurueck (<=155)', () => {
    const s = 'Reparaturkosten traegt die gegnerische Haftpflicht nach §249 BGB.'
    expect(metaDescriptionFromSnippet(s)).toBe(s)
  })

  it('kuerzt lange Snippets auf <=155 Zeichen mit Ellipsis + strippt Markdown-Bold', () => {
    const long =
      '**Kurz erklärt:** Reparaturkosten sind der zentrale Sachschaden bei ' +
      'Verkehrsunfaellen — erstattet werden Stundenverrechnungssaetze, Original-' +
      'Ersatzteile mit UPE-Aufschlaegen, Lackierung und Verbringungskosten, alles ' +
      'nach §249 BGB durch die gegnerische Haftpflichtversicherung.'
    const out = metaDescriptionFromSnippet(long)
    expect([...out].length).toBeLessThanOrEqual(155)
    expect(out.endsWith('…')).toBe(true)
    expect(out).not.toContain('**')
  })

  it('kuerzt an der Wortgrenze (kein Trennzeichen direkt vor dem Ellipsis)', () => {
    const long = 'einundzwanzig zweiundzwanzig dreiundzwanzig '.repeat(20)
    const out = metaDescriptionFromSnippet(long)
    expect([...out].length).toBeLessThanOrEqual(155)
    expect(out).not.toMatch(/[\s,;:.\-–—]…$/)
  })

  it('respektiert einen custom max-Wert', () => {
    const out = metaDescriptionFromSnippet('wort '.repeat(80), 60)
    expect([...out].length).toBeLessThanOrEqual(60)
  })
})
