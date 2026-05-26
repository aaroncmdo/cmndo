import { describe, it, expect } from 'vitest'
import {
  SERVICE_PITCH_HEADLINES,
  SERVICE_PITCH_SUB_HEADLINE_CLAIMONDO,
  SERVICE_PITCH_SUB_HEADLINE_KFZGUTACHTER_LP,
  SERVICE_REALITY_BULLETS,
  SERVICE_REALITY_CARDS_DETAILED,
  PLATTFORM_MECHANIK_STEPS,
  SERVICE_PITCH_CTAS,
  ANSPRUECHE_REFRAMED,
  SECTION_HEADLINES,
  SERVICE_PITCH_USPS,
  SERVICE_PITCH_BRAND_BLOCK,
} from '../service-pitch'

describe('service-pitch constants', () => {
  it('Hero-Headline claimondo enthält "Sie reden mit niemandem"', () => {
    expect(SERVICE_PITCH_HEADLINES.claimondo).toContain('Sie reden mit niemandem')
  })

  it('Hero-Headline kfzgutachterLp(stadt) personalisiert mit Stadtname', () => {
    expect(SERVICE_PITCH_HEADLINES.kfzgutachterLp('Köln')).toBe(
      'Unfall in Köln. Sie reden mit niemandem.',
    )
  })

  it('Hero-Headline kfzgutachterLp() Fallback ohne Stadt', () => {
    expect(SERVICE_PITCH_HEADLINES.kfzgutachterLp()).toBe(
      'Sie hatten Unfall. Sie reden mit niemandem.',
    )
  })

  it('Service-Realität-Bullets hat genau 5 Items', () => {
    expect(SERVICE_REALITY_BULLETS).toHaveLength(5)
  })

  it('Service-Realität-Card-Details hat genau 6 Items', () => {
    expect(SERVICE_REALITY_CARDS_DETAILED).toHaveLength(6)
  })

  it('Plattform-Mechanik hat genau 3 Steps mit Nummern 1, 2, 3', () => {
    expect(PLATTFORM_MECHANIK_STEPS).toHaveLength(3)
    expect(PLATTFORM_MECHANIK_STEPS.map((s) => s.nr)).toEqual([1, 2, 3])
  })

  it('Plattform-Mechanik Step-Titel sind knapp (≤ 3 Wörter)', () => {
    PLATTFORM_MECHANIK_STEPS.forEach((s) => {
      expect(s.titel.split(' ').length).toBeLessThanOrEqual(3)
    })
  })

  it('CTAs enthalten den Primary Wizard-CTA', () => {
    expect(SERVICE_PITCH_CTAS.primary).toContain('Versicherung reden')
  })

  it('ANSPRUECHE_REFRAMED hat 4 Items mit href + reframed text', () => {
    expect(ANSPRUECHE_REFRAMED).toHaveLength(4)
    ANSPRUECHE_REFRAMED.forEach((a) => {
      expect(a).toHaveProperty('href')
      expect(a.text).toMatch(/Wir (verhandeln|setzen|holen|lassen)/)
    })
  })

  it('SECTION_HEADLINES hat die 5 erwarteten Keys', () => {
    expect(Object.keys(SECTION_HEADLINES).sort()).toEqual([
      'anspruecheReframed',
      'lpDreiStep',
      'lpServicePitch',
      'misstrauenReframed',
      'schadensreportReframed',
    ])
  })

  it('Sub-Headline claimondo enthält "0 €" und "32 Tage"', () => {
    expect(SERVICE_PITCH_SUB_HEADLINE_CLAIMONDO).toContain('0 €')
    expect(SERVICE_PITCH_SUB_HEADLINE_CLAIMONDO).toContain('32 Tage')
  })

  it('Sub-Headline kfzgutachter-LP erwähnt "< 48 h" + "0 €"', () => {
    expect(SERVICE_PITCH_SUB_HEADLINE_KFZGUTACHTER_LP).toContain('< 48 h')
    expect(SERVICE_PITCH_SUB_HEADLINE_KFZGUTACHTER_LP).toContain('0 €')
  })

  it('SERVICE_PITCH_BRAND_BLOCK enthält alle 6 USP-Cluster', () => {
    const block = SERVICE_PITCH_BRAND_BLOCK
    expect(block).toContain('Sie reden mit niemandem') // Cluster 1
    expect(block).toContain('persönliche')             // Cluster 2
    expect(block).toContain('integriert')              // Cluster 3
    expect(block).toContain('32 Tage')                 // Cluster 4
    expect(block).toContain('disponiert')              // Cluster 6
  })

  it('SERVICE_PITCH_USPS hat genau 6 Cluster-Einträge', () => {
    expect(SERVICE_PITCH_USPS).toHaveLength(6)
    expect(SERVICE_PITCH_USPS[0].cluster).toBe(1)
  })
})
