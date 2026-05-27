import { describe, it, expect } from 'vitest'
import {
  isMarketingHost, isTrackingHost, parseConsent, categoriesToGcm,
} from '../consent'

describe('isMarketingHost', () => {
  it('erlaubt Apex + www + LP-Subdomain', () => {
    for (const h of ['claimondo.de', 'www.claimondo.de', 'kfzgutachter.claimondo.de'])
      expect(isMarketingHost(h)).toBe(true)
  })
  it('blockt Portale', () => {
    for (const h of ['app.claimondo.de', 'gutachter.claimondo.de', 'makler.claimondo.de'])
      expect(isMarketingHost(h)).toBe(false)
  })
  it('schneidet Port ab + case-insensitive', () => {
    expect(isMarketingHost('Claimondo.de:443')).toBe(true)
  })
  it('null -> false', () => { expect(isMarketingHost(null)).toBe(false) })
})

describe('parseConsent (cc_cookie JSON, url-encoded)', () => {
  const mk = (cats: string[]) => encodeURIComponent(JSON.stringify({ categories: cats }))
  it('liest analytics/ads aus categories', () => {
    expect(parseConsent(mk(['necessary', 'analytics']))).toEqual({ statistics: true, marketing: false })
    expect(parseConsent(mk(['necessary', 'analytics', 'ads']))).toEqual({ statistics: true, marketing: true })
  })
  it('leer/invalid -> alles false', () => {
    expect(parseConsent(undefined)).toEqual({ statistics: false, marketing: false })
    expect(parseConsent('not-json')).toEqual({ statistics: false, marketing: false })
  })
})

describe('categoriesToGcm', () => {
  it('mappt analytics->analytics_storage, ads->ad_*', () => {
    expect(categoriesToGcm({ statistics: true, marketing: false })).toEqual({
      analytics_storage: 'granted', functionality_storage: 'granted',
      ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
    })
  })
})
