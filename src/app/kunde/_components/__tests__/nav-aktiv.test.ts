import { describe, it, expect } from 'vitest'
import { bestimmeAktivenHref, istClaimDetailPfad } from '../nav-aktiv'

const FALL_HREF = '/kunde/faelle/claim-1'

/** Die Nav-Hrefs in der Reihenfolge aus buildNavItems (Single-Fall-Variante). */
const ITEMS = [
  { href: FALL_HREF, exact: false },
  { href: '/kunde/termine', exact: false },
  { href: '/kunde/nachbesichtigung', exact: false },
  { href: '/kunde/fahrzeuge', exact: false },
  { href: '/kunde/chat', exact: false },
  { href: '/kunde/profil', exact: false },
]

describe('istClaimDetailPfad', () => {
  it('erkennt die kanonische Claim-Detailseite', () => {
    expect(istClaimDetailPfad('/kunde/fahrzeuge/veh-1/schaden/claim-1')).toBe(true)
  })

  it('die Fahrzeug-Detailseite ist keine Claim-Detailseite', () => {
    expect(istClaimDetailPfad('/kunde/fahrzeuge/veh-1')).toBe(false)
  })

  it('die Fahrzeug-Liste ist keine Claim-Detailseite', () => {
    expect(istClaimDetailPfad('/kunde/fahrzeuge')).toBe(false)
  })

  it('null ist keine Claim-Detailseite', () => {
    expect(istClaimDetailPfad(null)).toBe(false)
  })
})

describe('bestimmeAktivenHref', () => {
  // Der gemeldete Befund: Klick auf „Mein Fall" -> Redirect unter /fahrzeuge/ ->
  // vorher sprang die Markierung auf „Fahrzeuge".
  it('markiert auf der Claim-Detailseite das Fall-Item, nicht Fahrzeuge', () => {
    expect(bestimmeAktivenHref('/kunde/fahrzeuge/veh-1/schaden/claim-1', ITEMS, FALL_HREF))
      .toBe(FALL_HREF)
  })

  it('markiert auf der Fahrzeug-Detailseite weiterhin Fahrzeuge', () => {
    expect(bestimmeAktivenHref('/kunde/fahrzeuge/veh-1', ITEMS, FALL_HREF))
      .toBe('/kunde/fahrzeuge')
  })

  it('markiert in der Fahrzeug-Liste Fahrzeuge', () => {
    expect(bestimmeAktivenHref('/kunde/fahrzeuge', ITEMS, FALL_HREF))
      .toBe('/kunde/fahrzeuge')
  })

  // Ohne Fall-Item (Kunde mit mehreren Faellen) bleibt es beim normalen Matching.
  it('ohne Fall-Item gewinnt auf der Claim-Detailseite Fahrzeuge', () => {
    const ohneFall = ITEMS.filter((i) => i.href !== FALL_HREF)
    expect(bestimmeAktivenHref('/kunde/fahrzeuge/veh-1/schaden/claim-1', ohneFall, null))
      .toBe('/kunde/fahrzeuge')
  })

  it('markiert die direkte Fall-Route', () => {
    expect(bestimmeAktivenHref(FALL_HREF, ITEMS, FALL_HREF)).toBe(FALL_HREF)
  })

  it('markiert Sub-Routen des Fall-Items', () => {
    expect(bestimmeAktivenHref(`${FALL_HREF}/kalender`, ITEMS, FALL_HREF)).toBe(FALL_HREF)
  })

  it.each([
    ['/kunde/termine', '/kunde/termine'],
    ['/kunde/chat', '/kunde/chat'],
    ['/kunde/profil', '/kunde/profil'],
    ['/kunde/nachbesichtigung', '/kunde/nachbesichtigung'],
  ])('markiert %s unveraendert', (pfad, erwartet) => {
    expect(bestimmeAktivenHref(pfad, ITEMS, FALL_HREF)).toBe(erwartet)
  })

  it('markiert nichts auf einer fremden Route', () => {
    expect(bestimmeAktivenHref('/kunde/schaden-melden', ITEMS, FALL_HREF)).toBeNull()
  })

  it('exact-Item matcht nur exakt', () => {
    const mitDashboard = [{ href: '/kunde', exact: true }, ...ITEMS]
    expect(bestimmeAktivenHref('/kunde', mitDashboard, null)).toBe('/kunde')
    expect(bestimmeAktivenHref('/kunde/termine', mitDashboard, null)).toBe('/kunde/termine')
  })

  // Sonst waeren bei verschachtelten Hrefs zwei Eintraege gleichzeitig markiert.
  it('der spezifischere Href gewinnt bei Verschachtelung', () => {
    const verschachtelt = [
      { href: '/kunde/fahrzeuge', exact: false },
      { href: '/kunde/fahrzeuge/liste', exact: false },
    ]
    expect(bestimmeAktivenHref('/kunde/fahrzeuge/liste', verschachtelt, null))
      .toBe('/kunde/fahrzeuge/liste')
  })

  it('null-Pfad markiert nichts', () => {
    expect(bestimmeAktivenHref(null, ITEMS, FALL_HREF)).toBeNull()
  })
})
