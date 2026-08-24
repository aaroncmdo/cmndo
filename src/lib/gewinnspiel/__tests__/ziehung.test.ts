import { describe, it, expect, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))

import { waehleGewinner } from '../ziehung'

describe('waehleGewinner', () => {
  it('zieht die gewuenschte Anzahl', () => {
    expect(waehleGewinner(['a', 'b', 'c', 'd', 'e'], 3)).toHaveLength(3)
  })

  it('zieht ohne Zuruecklegen (keine Dubletten)', () => {
    const gewinner = waehleGewinner(['a', 'b', 'c', 'd', 'e'], 5)
    expect(new Set(gewinner).size).toBe(5)
  })

  it('gibt bei Unterdeckung alle zurueck, nicht mehr', () => {
    // Der Normalfall beim Start: weniger Teilnehmer als Preise.
    expect(waehleGewinner(['a', 'b'], 3)).toHaveLength(2)
  })

  it('kommt mit leerem Lostopf klar', () => {
    expect(waehleGewinner([], 3)).toEqual([])
  })

  it('veraendert den Eingabe-Array nicht', () => {
    const lostopf = ['a', 'b', 'c']
    waehleGewinner(lostopf, 2)
    expect(lostopf).toEqual(['a', 'b', 'c'])
  })

  it('zieht nur aus dem Lostopf', () => {
    const lostopf = ['a', 'b', 'c', 'd']
    for (const g of waehleGewinner(lostopf, 2)) expect(lostopf).toContain(g)
  })

  it('streut ueber viele Laeufe (kein konstantes Ergebnis)', () => {
    const gesehen = new Set<string>()
    for (let i = 0; i < 60; i++) gesehen.add(waehleGewinner(['a', 'b', 'c', 'd'], 1)[0])
    expect(gesehen.size).toBeGreaterThan(1)
  })

  it('erreicht ueber viele Laeufe jeden Kandidaten (keine systematische Bevorzugung)', () => {
    const gesehen = new Set<string>()
    for (let i = 0; i < 400; i++) {
      for (const g of waehleGewinner(['a', 'b', 'c', 'd'], 1)) gesehen.add(g)
    }
    expect(gesehen.size).toBe(4)
  })
})
