import { describe, it, expect } from 'vitest'
import {
  CHECK_REF_COOKIE,
  CHECK_REF_MAX_AGE_S,
  parseCheckRef,
  leseCheckRefAusCookieHeader,
  erzeugeCheckRefCookie,
  getOrCreateCheckRef,
} from './check-ref'

// Nachtraegliche Verknuepfung (2026-09-09): /check merkt sich eine Browser-Kennung (First-Party-Cookie),
// haengt sie an den Foto-CTA und liest sie beim Kontakt serverseitig. Alles hier ist DOM-frei testbar.

const REF = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('parseCheckRef', () => {
  it('nimmt eine UUID an und liefert sie kleingeschrieben', () => {
    expect(parseCheckRef(REF.toUpperCase())).toBe(REF)
  })
  it('verwirft alles andere', () => {
    for (const wert of ['', null, undefined, 'abc', REF.slice(0, -1)]) expect(parseCheckRef(wert)).toBeNull()
  })
})

describe('leseCheckRefAusCookieHeader', () => {
  it('findet den Wert zwischen anderen Cookies', () => {
    expect(leseCheckRefAusCookieHeader(`_ga=GA1.2.1; ${CHECK_REF_COOKIE}=${REF}; __oppref=xyz`)).toBe(REF)
  })
  it('liefert null ohne Cookie, bei leerem Header oder ungueltigem Wert', () => {
    expect(leseCheckRefAusCookieHeader('')).toBeNull()
    expect(leseCheckRefAusCookieHeader('_ga=1')).toBeNull()
    expect(leseCheckRefAusCookieHeader(`${CHECK_REF_COOKIE}=kaputt`)).toBeNull()
  })
  it('verwechselt den Namen nicht mit einem laengeren Cookie-Namen', () => {
    expect(leseCheckRefAusCookieHeader(`x${CHECK_REF_COOKIE}=${REF}`)).toBeNull()
  })
})

describe('erzeugeCheckRefCookie', () => {
  it('setzt Name, Wert, 30 Tage, Path, SameSite=Lax und Secure', () => {
    expect(CHECK_REF_MAX_AGE_S).toBe(30 * 24 * 60 * 60)
    expect(erzeugeCheckRefCookie(REF)).toBe(`${CHECK_REF_COOKIE}=${REF}; Max-Age=${CHECK_REF_MAX_AGE_S}; Path=/; SameSite=Lax; Secure`)
  })
})

describe('getOrCreateCheckRef', () => {
  it('erzeugt eine neue ref, wenn keine da ist, und schreibt das Cookie', () => {
    const doc = { cookie: '' }
    const ref = getOrCreateCheckRef(doc, () => REF)
    expect(ref).toBe(REF)
    expect(doc.cookie).toContain(`${CHECK_REF_COOKIE}=${REF}`)
  })
  it('gibt die vorhandene ref zurueck und schreibt nichts neu', () => {
    const doc = { cookie: `${CHECK_REF_COOKIE}=${REF}` }
    let erzeugt = 0
    const ref = getOrCreateCheckRef(doc, () => { erzeugt++; return 'neu' })
    expect(ref).toBe(REF)
    expect(erzeugt).toBe(0)
    expect(doc.cookie).toBe(`${CHECK_REF_COOKIE}=${REF}`)
  })
  it('ersetzt ein kaputtes Cookie durch eine frische ref', () => {
    const doc = { cookie: `${CHECK_REF_COOKIE}=kaputt` }
    expect(getOrCreateCheckRef(doc, () => REF)).toBe(REF)
    expect(doc.cookie).toContain(`${CHECK_REF_COOKIE}=${REF}`)
  })
})
