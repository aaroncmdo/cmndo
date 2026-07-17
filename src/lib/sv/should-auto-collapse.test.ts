import { describe, it, expect } from 'vitest'
import { shouldAutoCollapseStopCard } from './should-auto-collapse'

const T = 500

describe('shouldAutoCollapseStopCard', () => {
  it('unbekannte Distanz (null) kollabiert NIE — Primaeraktion bleibt sichtbar', () => {
    // Kern-Regressionsschutz des 17.07.-Fixes: null = GPS verweigert / keine Koords /
    // Tiefgarage. Fruehere Logik (== null -> collapse) versteckte „Ich bin angekommen".
    expect(shouldAutoCollapseStopCard(null, T)).toBe(false)
  })
  it('bekannte grosse Distanz (> Schwelle) kollabiert — SV faehrt, Navigation primaer', () => {
    expect(shouldAutoCollapseStopCard(1200, T)).toBe(true)
  })
  it('bekannte kleine Distanz (<= Schwelle) bleibt offen — SV ist da', () => {
    expect(shouldAutoCollapseStopCard(200, T)).toBe(false)
    expect(shouldAutoCollapseStopCard(T, T)).toBe(false) // exakt an der Schwelle
  })
})
