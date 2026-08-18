import { beforeEach, describe, expect, it } from 'vitest'
import {
  kernStecktImHost,
  robotsFuerHost,
  verarbeiteLead,
  type Antwort,
  type Lead,
  type RobotsCache,
} from '../lauf'

/**
 * Der Holer ist injiziert — geprueft wird die ENTSCHEIDUNGSLOGIK des Laufs,
 * nicht das Netz: welche Kandidaten in welcher Reihenfolge, wann abgebrochen
 * wird, wie robots.txt-Fehlschlaege gelesen werden, wie Funde entstehen.
 */
let abgerufen: string[] = []
let seiten: Record<string, Antwort> = {}
let cache: RobotsCache

const hole = async (url: string): Promise<Antwort> => {
  abgerufen.push(url)
  return seiten[url] ?? { status: 404, text: '' }
}

function lead(over: Partial<Lead> = {}): Lead {
  return {
    id: 'L1',
    firma: 'Sachverstaendigenbuero Habermehl GmbH',
    name: 'Habermehl',
    ort: 'Muenster',
    plz: '48143',
    website_url: null,
    ...over,
  }
}

const IMPRESSUM_HTML = `
  <html><body>
    <h1>Impressum</h1>
    <p>Sachverstaendigenbuero Habermehl GmbH, Hafenweg 3, 48143 Muenster</p>
    <p>Inhaber: Klaus Habermehl</p>
    <p>Telefon: 0251 1234567</p>
    <a href="mailto:klaus@habermehl.de">Mail</a>
  </body></html>`

const STARTSEITE_HTML = `
  <html><body>Sachverstaendigenbuero Habermehl GmbH — 48143 Muenster</body></html>`

beforeEach(() => {
  abgerufen = []
  seiten = {}
  cache = new Map()
})

describe('kernStecktImHost', () => {
  it('findet den Kernbegriff im Host', () => {
    expect(kernStecktImHost('habermehl', 'habermehl.de')).toBe(true)
  })

  // Der Bug, der 40 Sicherheit verschenkt haette: ''.split(' ') ist ['']
  it('ist bei leerem Kern false, nicht true', () => {
    expect(kernStecktImHost('', 'irgendwas.de')).toBe(false)
  })

  it('ignoriert Kurzfragmente', () => {
    expect(kernStecktImHost('a b', 'zab.de')).toBe(false)
  })
})

describe('robotsFuerHost', () => {
  it('liest ein Disallow als Verbot', async () => {
    seiten['https://x.de/robots.txt'] = { status: 200, text: 'User-agent: *\nDisallow: /impressum' }
    const erlaubt = await robotsFuerHost('x.de', hole, cache)
    expect(erlaubt('/impressum')).toBe(false)
    expect(erlaubt('/')).toBe(true)
  })

  it('behandelt 404 als "keine Regeln" — erlaubt', async () => {
    seiten['https://x.de/robots.txt'] = { status: 404, text: '' }
    const erlaubt = await robotsFuerHost('x.de', hole, cache)
    expect(erlaubt('/')).toBe(true)
  })

  // "unklar" als "erlaubt" zu lesen heisst, gegen ein ungesehenes Verbot crawlen
  it('behandelt 500 als unklar — verboten', async () => {
    seiten['https://x.de/robots.txt'] = { status: 500, text: '' }
    const erlaubt = await robotsFuerHost('x.de', hole, cache)
    expect(erlaubt('/')).toBe(false)
  })

  it('behandelt einen Netzfehler (status 0) als unklar — verboten', async () => {
    seiten['https://x.de/robots.txt'] = { status: 0, text: '' }
    const erlaubt = await robotsFuerHost('x.de', hole, cache)
    expect(erlaubt('/')).toBe(false)
  })

  it('holt robots.txt je Host nur einmal', async () => {
    seiten['https://x.de/robots.txt'] = { status: 200, text: '' }
    await robotsFuerHost('x.de', hole, cache)
    await robotsFuerHost('x.de', hole, cache)
    expect(abgerufen.filter((u) => u.endsWith('/robots.txt'))).toHaveLength(1)
  })
})

describe('verarbeiteLead', () => {
  it('faellt mit Grund durch, wenn der Name nur Gattungswoerter enthaelt', async () => {
    const b = await verarbeiteLead(lead({ firma: 'Kfz-Sachverstaendigenbuero GmbH' }), hole, cache)

    expect(b.website).toBeNull()
    expect(b.grund).toContain('Gattungswoertern')
    expect(abgerufen).toHaveLength(0)   // kein Netzabruf ohne Kandidaten
  })

  it('findet Website und Kontaktdaten und belegt jeden Fund mit seiner Quelle', async () => {
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }
    seiten['https://habermehl.de/impressum'] = { status: 200, text: IMPRESSUM_HTML }

    const b = await verarbeiteLead(lead(), hole, cache)

    expect(b.website).toBe('https://habermehl.de')
    expect(b.websiteSicherheit).toBeGreaterThanOrEqual(90)
    expect(b.grund).toBeNull()

    const felder = b.funde.map((f) => f.feld)
    expect(felder).toContain('website_url')
    expect(felder).toContain('email')
    expect(felder).toContain('telefon')
    expect(felder).toContain('vorname')

    const email = b.funde.find((f) => f.feld === 'email')
    expect(email?.wert).toBe('klaus@habermehl.de')
    expect(email?.quelleUrl).toBe('https://habermehl.de/impressum')

    const tel = b.funde.find((f) => f.feld === 'telefon')
    expect(tel?.wert).toBe('+492511234567')

    expect(b.funde.find((f) => f.feld === 'nachname')?.wert).toBe('Habermehl')
  })

  it('kappt eine Rollenadresse auf 60', async () => {
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }
    seiten['https://habermehl.de/impressum'] = {
      status: 200,
      text: '<a href="mailto:info@habermehl.de">Mail</a>',
    }

    const b = await verarbeiteLead(lead(), hole, cache)
    expect(b.funde.find((f) => f.feld === 'email')?.sicherheit).toBe(60)
  })

  it('respektiert Disallow auf /impressum und nutzt /kontakt', async () => {
    seiten['https://habermehl.de/robots.txt'] = {
      status: 200, text: 'User-agent: *\nDisallow: /impressum',
    }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }
    seiten['https://habermehl.de/impressum'] = { status: 200, text: IMPRESSUM_HTML }
    seiten['https://habermehl.de/kontakt'] = {
      status: 200, text: '<a href="mailto:klaus@habermehl.de">Mail</a>',
    }

    const b = await verarbeiteLead(lead(), hole, cache)

    expect(abgerufen).not.toContain('https://habermehl.de/impressum')
    expect(b.funde.find((f) => f.feld === 'email')?.quelleUrl).toBe('https://habermehl.de/kontakt')
  })

  it('bricht bei Sicherheit 90+ ab und probiert keine weiteren Kandidaten', async () => {
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }

    await verarbeiteLead(lead(), hole, cache)

    expect(abgerufen).not.toContain('https://sv-habermehl.de/robots.txt')
  })

  it('meldet mit Grund, wenn kein Kandidat erreichbar ist', async () => {
    const b = await verarbeiteLead(lead(), hole, cache)   // alles 404
    expect(b.website).toBeNull()
    expect(b.grund).toContain('kein Kandidat erreichbar')
    expect(b.funde).toHaveLength(0)
  })

  it('nutzt eine bekannte Website direkt, mit Sicherheit 100 und ohne website_url-Fund', async () => {
    seiten['https://gutachten-nord.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://gutachten-nord.de/'] = { status: 200, text: '<html>irgendwas</html>' }
    seiten['https://gutachten-nord.de/impressum'] = { status: 200, text: IMPRESSUM_HTML }

    const b = await verarbeiteLead(
      lead({ website_url: 'https://www.gutachten-nord.de/start' }), hole, cache,
    )

    expect(b.website).toBe('https://gutachten-nord.de')
    expect(b.websiteSicherheit).toBe(100)
    expect(b.kandidaten).toEqual(['gutachten-nord.de'])   // nicht geraten
    expect(b.funde.map((f) => f.feld)).not.toContain('website_url')
    expect(b.funde.find((f) => f.feld === 'email')?.wert).toBe('klaus@habermehl.de')
  })

  it('behaelt je Feld den ersten Fund — /impressum schlaegt /kontakt', async () => {
    seiten['https://habermehl.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }
    // /impressum nennt nur die Person, /kontakt eine andere Person + Mail
    seiten['https://habermehl.de/impressum'] = {
      status: 200, text: '<p>Inhaber: Klaus Habermehl</p>',
    }
    seiten['https://habermehl.de/kontakt'] = {
      status: 200,
      text: '<p>Inhaber: Petra Fremd</p><a href="mailto:klaus@habermehl.de">Mail</a>',
    }

    const b = await verarbeiteLead(lead(), hole, cache)

    const vornamen = b.funde.filter((f) => f.feld === 'vorname')
    expect(vornamen).toHaveLength(1)
    expect(vornamen[0].wert).toBe('Klaus')
    expect(b.funde.find((f) => f.feld === 'email')?.wert).toBe('klaus@habermehl.de')
  })

  it('ueberspringt einen Kandidaten, dessen robots.txt die Wurzel sperrt', async () => {
    seiten['https://habermehl.de/robots.txt'] = {
      status: 200, text: 'User-agent: *\nDisallow: /',
    }
    seiten['https://habermehl.de/'] = { status: 200, text: STARTSEITE_HTML }

    const b = await verarbeiteLead(lead(), hole, cache)

    expect(abgerufen).not.toContain('https://habermehl.de/')
    expect(b.website).toBeNull()
  })
})
