import { describe, it, expect } from 'vitest'
import { herkunftAusReferer, LEERE_HERKUNFT } from './herkunft'

describe('herkunftAusReferer', () => {
  it('liefert die Seite als origin + pathname', () => {
    const h = herkunftAusReferer('https://claimondo.de/kfz-gutachter/koeln')
    expect(h.page_url).toBe('https://claimondo.de/kfz-gutachter/koeln')
  })

  it('liest die fuenf UTM-Parameter', () => {
    const h = herkunftAusReferer(
      'https://claimondo.de/?utm_source=google&utm_medium=cpc&utm_campaign=koeln&utm_content=v2&utm_term=kfz+gutachter',
    )
    expect(h.utm_source).toBe('google')
    expect(h.utm_medium).toBe('cpc')
    expect(h.utm_campaign).toBe('koeln')
    expect(h.utm_content).toBe('v2')
    expect(h.utm_term).toBe('kfz gutachter')
  })

  it('VERWIRFT fremde Query-Parameter', () => {
    // Der Kern der Datensparsamkeit: die Zeile haengt an einer Person, und
    // fremde Parameter koennen Suchbegriffe, Token oder E-Mail-Adressen tragen.
    const h = herkunftAusReferer(
      'https://claimondo.de/check?email=kunde%40example.com&token=geheim&utm_source=newsletter',
    )
    expect(h.page_url).toBe('https://claimondo.de/check')
    expect(h.page_url).not.toContain('email')
    expect(h.page_url).not.toContain('token')
    expect(h.utm_source).toBe('newsletter')
  })

  it('haelt fremde Domains fest — gerade die sind interessant', () => {
    const h = herkunftAusReferer('https://www.google.com/search')
    expect(h.page_url).toBe('https://www.google.com/search')
  })

  it('erkennt die anderen eigenen Domains', () => {
    expect(herkunftAusReferer('https://autounfall.io/nutzungsausfall').page_url)
      .toBe('https://autounfall.io/nutzungsausfall')
    expect(herkunftAusReferer('https://kfz-unfallgutachter-koeln.de/lp/frechen').page_url)
      .toBe('https://kfz-unfallgutachter-koeln.de/lp/frechen')
  })

  it('gibt bei fehlendem Referer alles leer zurueck', () => {
    expect(herkunftAusReferer(null)).toEqual(LEERE_HERKUNFT)
    expect(herkunftAusReferer(undefined)).toEqual(LEERE_HERKUNFT)
    expect(herkunftAusReferer('')).toEqual(LEERE_HERKUNFT)
  })

  it('wirft nicht bei kaputtem Header', () => {
    // Ein Referer kommt von aussen — er darf die Anfrage nie scheitern lassen.
    expect(herkunftAusReferer('kein-url')).toEqual(LEERE_HERKUNFT)
    expect(herkunftAusReferer('///')).toEqual(LEERE_HERKUNFT)
  })

  it('ignoriert Nicht-HTTP-Protokolle', () => {
    expect(herkunftAusReferer('javascript:alert(1)')).toEqual(LEERE_HERKUNFT)
    expect(herkunftAusReferer('data:text/html,<h1>x</h1>')).toEqual(LEERE_HERKUNFT)
    expect(herkunftAusReferer('file:///etc/passwd')).toEqual(LEERE_HERKUNFT)
  })

  it('kappt ueberlange Werte', () => {
    const lang = 'https://claimondo.de/' + 'a'.repeat(900)
    expect(herkunftAusReferer(lang).page_url!.length).toBe(500)

    // 150 = die Grenze aus EmbedAnfrageSchema; ein serverseitig ergaenzter Wert
    // darf nie laenger sein als ein vom Client gelieferter.
    const langesUtm = `https://claimondo.de/?utm_campaign=${'b'.repeat(400)}`
    expect(herkunftAusReferer(langesUtm).utm_campaign!.length).toBe(150)
  })

  it('macht aus einem leeren UTM-Wert null, nicht einen leeren String', () => {
    const h = herkunftAusReferer('https://claimondo.de/?utm_source=&utm_medium=%20')
    expect(h.utm_source).toBeNull()
    expect(h.utm_medium).toBeNull()
  })

  it('setzt `source` nirgends — das Feld ist RLS-Steuerung, kein Attribut', () => {
    // Die INSERT-Policy lautet `with_check (source IS NULL)`. Ein Wert dort
    // liesse jeden anonymen Finder-Submit von RLS abgelehnt werden.
    const h = herkunftAusReferer('https://claimondo.de/gutachter-finden')
    expect(Object.keys(h)).not.toContain('source')
  })
})
