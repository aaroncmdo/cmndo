import { describe, it, expect } from 'vitest'
import { getVersicherer, getVersichererBySlug, getAllAssets } from '../claimondo-mdx'
import {
  VERSICHERER_LISTE,
  getVersichererBaseInfo,
  getKonzernSiblings,
  BAFIN_BRANCHENSCHNITT_2024,
} from '@/data/versicherer-mapping'

describe('VERSICHERER_LISTE (Stammdaten-SSoT)', () => {
  it('enthält 15 Referenz-Versicherer mit eindeutigen Slugs', () => {
    expect(VERSICHERER_LISTE.length).toBe(15)
    const slugs = VERSICHERER_LISTE.map((v) => v.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('K1: DA Direkt → Zurich, CosmosDirekt → Generali (korrigiertes Konzern-Mapping)', () => {
    expect(getVersichererBaseInfo('da-direkt')?.konzernSlug).toBe('zurich')
    expect(getVersichererBaseInfo('da-direkt')?.mutterkonzern).toContain('Zurich')
    expect(getVersichererBaseInfo('cosmosdirekt')?.konzernSlug).toBe('generali')
    expect(getVersichererBaseInfo('cosmosdirekt')?.mutterkonzern).toContain('Generali')
  })

  it('K2: ERGO hat BaFin-Quote 4,7 (höchste der großen Versicherer)', () => {
    expect(getVersichererBaseInfo('ergo')?.bafinQuote2024).toBe(4.7)
  })

  it('B2/K10: offiziell nicht ausgewiesene BaFin-Quoten sind null + tragen eine Note', () => {
    for (const slug of ['generali', 'cosmosdirekt', 'da-direkt', 'zurich']) {
      const v = getVersichererBaseInfo(slug)
      expect(v?.bafinQuote2024).toBeNull()
      expect(v?.bafinNote).toBeTruthy()
    }
  })

  it('getKonzernSiblings: DA Direkt teilt den Konzern mit Zurich, ohne sich selbst', () => {
    const siblings = getKonzernSiblings('da-direkt').map((v) => v.slug)
    expect(siblings).toContain('zurich')
    expect(siblings).not.toContain('da-direkt')
  })

  it('Branchenschnitt-Konstante = 2,2', () => {
    expect(BAFIN_BRANCHENSCHNITT_2024).toBe(2.2)
  })
})

describe('getVersicherer (Loader: MD ∩ Stammdaten)', () => {
  it('lädt mindestens den Test-Hub und joint die Stammdaten je Slug', () => {
    const all = getVersicherer()
    expect(all.length).toBeGreaterThanOrEqual(1)
    for (const v of all) {
      expect(v.base).toBeDefined()
      expect(v.base.slug).toBe(v.slug)
      expect(v.publishStatus).not.toBe('draft')
    }
  })

  it('sortiert nach Marktanteil absteigend', () => {
    const shares = getVersicherer().map((v) => v.base.marktanteilPct)
    expect(shares).toEqual([...shares].sort((a, b) => b - a))
  })

  it('getVersichererBySlug: huk-coburg-allgemeine mit korrekter URL, Typ und BaFin-Quote', () => {
    const v = getVersichererBySlug('huk-coburg-allgemeine')
    expect(v).not.toBeNull()
    expect(v?.url).toBe('/versicherer/huk-coburg-allgemeine')
    expect(v?.type).toBe('versicherer-hub')
    expect(v?.base.bafinQuote2024).toBe(2.73)
  })

  it('getVersichererBySlug: null für unbekannten Slug', () => {
    expect(getVersichererBySlug('gibt-es-nicht')).toBeNull()
  })

  it('Regression: Versicherer-Hubs fließen NICHT in getAllAssets (eigener Loader)', () => {
    expect(getAllAssets().some((a) => a.folder === 'versicherer')).toBe(false)
  })
})
