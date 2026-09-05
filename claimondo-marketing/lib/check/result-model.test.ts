import { describe, it, expect } from 'vitest'
import { resolveTier, buildCheckResult } from './result-model'

describe('resolveTier', () => {
  it('mappt Schuld-Antwort auf Tier', () => {
    expect(resolveTier('gegner')).toBe('voll')
    expect(resolveTier('teils')).toBe('quote')
    expect(resolveTier('selbst')).toBe('kasko')
    expect(resolveTier('unklar')).toBe('pruefen')
    expect(resolveTier(undefined)).toBe('pruefen')
  })
})

describe('buildCheckResult', () => {
  it('Gegner schuld → voll: Haftpflicht-Positionen + €-Spannen', () => {
    const r = buildCheckResult({ schuld: 'gegner' })
    expect(r.tier).toBe('voll')
    expect(r.headingKey).toBe('result_voll_heading')
    expect(r.subKey).toBe('result_voll_sub')
    expect(r.positions).toEqual(['gutachten', 'wertminderung', 'nutzungsausfall', 'anwalt', 'auslagen'])
    expect(r.showRanges).toBe(true)
  })

  it('Teilschuld → quote: €-Spannen an + Teilschuld-Insight', () => {
    const r = buildCheckResult({ schuld: 'teils' })
    expect(r.tier).toBe('quote')
    expect(r.showRanges).toBe(true)
    expect(r.insightKeys).toContain('insight_teilschuld')
  })

  it('Eigenverschulden → kasko: Kasko-Positionen, KEINE €-Spannen, aber Foto-Check + Werkstattbindungs-Hinweis', () => {
    const r = buildCheckResult({ schuld: 'selbst' })
    expect(r.tier).toBe('kasko')
    expect(r.positions).toEqual(['kasko_gutachten', 'kasko_werkstatt', 'kasko_abwicklung'])
    expect(r.showRanges).toBe(false)
    expect(r.showFotoCta).toBe(true)
    expect(r.insightKeys).toContain('insight_kasko')
    expect(r.insightKeys).toContain('insight_kasko_werkstattbindung')
  })

  it('unklar → pruefen: kein Foto-CTA (keine Schuld-Vorbelegung moeglich); voll/quote zeigen ihn', () => {
    expect(buildCheckResult({ schuld: 'unklar' }).showFotoCta).toBe(false)
    expect(buildCheckResult({ schuld: 'gegner' }).showFotoCta).toBe(true)
    expect(buildCheckResult({ schuld: 'teils' }).showFotoCta).toBe(true)
  })

  it('unklar → pruefen: kein €-Block + Prüf-Insight', () => {
    const r = buildCheckResult({ schuld: 'unklar' })
    expect(r.tier).toBe('pruefen')
    expect(r.showRanges).toBe(false)
    expect(r.insightKeys).toContain('insight_unklar')
  })

  it('Insights: Gegner-Versicherung-Gutachter + frische Frist', () => {
    const r = buildCheckResult({ schuld: 'gegner', gutachten: 'versicherung', unfall_her: 'unter_woche' })
    expect(r.insightKeys).toContain('insight_versicherung')
    expect(r.insightKeys).toContain('insight_frist_frisch')
  })

  it('Unfall > 1 Monat → Verjährungs-Reassurance', () => {
    const r = buildCheckResult({ schuld: 'gegner', unfall_her: 'ueber_monat' })
    expect(r.insightKeys).toContain('insight_verjaehrung')
  })

  it('leere Antworten → pruefen (kein Crash)', () => {
    const r = buildCheckResult({})
    expect(r.tier).toBe('pruefen')
    expect(r.positions.length).toBeGreaterThan(0)
  })
})
