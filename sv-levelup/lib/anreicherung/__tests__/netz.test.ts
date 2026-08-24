import { beforeEach, describe, expect, it } from 'vitest'
import { erzeugeHoler } from '../netz'
import { USER_AGENT } from '../lauf'

/**
 * Gefaelschte Uhr: `warte(ms)` schiebt die Zeit vor, statt echt zu schlafen.
 * So ist die Drossel pruefbar, ohne dass der Test Sekunden verbraucht.
 */
let uhr = 0
let gewartet: number[] = []
let aufrufe: { url: string; init?: RequestInit }[] = []
let antworten: Record<string, { status: number; body: string; typ?: string } | Error> = {}

const jetzt = () => uhr
const warte = async (ms: number) => { gewartet.push(ms); uhr += ms }

const fakeFetch = (async (url: string | URL | Request, init?: RequestInit) => {
  const s = String(url)
  aufrufe.push({ url: s, init })
  const a = antworten[s]
  if (a instanceof Error) throw a
  if (!a) return neueRes(404, '', 'text/html')
  return neueRes(a.status, a.body, a.typ ?? 'text/html')
}) as unknown as typeof fetch

function neueRes(status: number, body: string, typ: string) {
  return {
    status,
    headers: { get: (k: string) => (k.toLowerCase() === 'content-type' ? typ : null) },
    text: async () => body,
  } as unknown as Response
}

function netzFehler(code: string): Error {
  const e = new TypeError('fetch failed') as Error & { cause?: { code: string } }
  e.cause = { code }
  return e
}

function holer(extra: Record<string, unknown> = {}) {
  return erzeugeHoler({ fetchImpl: fakeFetch, jetzt, warte, ...extra })
}

beforeEach(() => {
  uhr = 0
  gewartet = []
  aufrufe = []
  antworten = {}
})

describe('erzeugeHoler', () => {
  it('sendet den eigenen User-Agent mit', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'hi' }
    await holer()('https://a.de/')

    const kopf = aufrufe[0].init?.headers as Record<string, string>
    expect(kopf['user-agent']).toBe(USER_AGENT)
    expect(USER_AGENT).toContain('sv-levelup.claimondo.de')   // identifizierbar
  })

  it('wartet zwischen zwei Abrufen desselben Hosts', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'x' }
    antworten['https://a.de/impressum'] = { status: 200, body: 'y' }

    const hole = holer()
    await hole('https://a.de/')
    await hole('https://a.de/impressum')

    expect(gewartet).toContain(2000)
  })

  it('wartet NICHT zwischen verschiedenen Hosts', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'x' }
    antworten['https://b.de/'] = { status: 200, body: 'y' }

    const hole = holer()
    await hole('https://a.de/')
    await hole('https://b.de/')

    expect(gewartet).toHaveLength(0)
  })

  it('wiederholt bei 503 genau einmal', async () => {
    antworten['https://a.de/'] = { status: 503, body: '' }
    const antwort = await holer()('https://a.de/')

    expect(aufrufe).toHaveLength(2)
    expect(antwort.status).toBe(503)
  })

  // Eine Domain, die es nicht gibt, gibt es beim zweiten Versuch auch nicht
  it('wiederholt bei ENOTFOUND NICHT', async () => {
    antworten['https://gibtesnicht.de/'] = netzFehler('ENOTFOUND')
    const antwort = await holer()('https://gibtesnicht.de/')

    expect(aufrufe).toHaveLength(1)
    expect(antwort.status).toBe(0)
  })

  it('wiederholt bei einem transienten Netzfehler einmal', async () => {
    antworten['https://a.de/'] = netzFehler('ETIMEDOUT')
    await holer()('https://a.de/')
    expect(aufrufe).toHaveLength(2)
  })

  it('meldet einen Netzfehler als status 0 statt zu werfen', async () => {
    antworten['https://a.de/'] = netzFehler('ECONNRESET')
    await expect(holer()('https://a.de/')).resolves.toMatchObject({ status: 0 })
  })

  it('laedt keinen Nicht-Text-Inhalt', async () => {
    antworten['https://a.de/prospekt.pdf'] = {
      status: 200, body: 'PDF-Rohdaten', typ: 'application/pdf',
    }
    const antwort = await holer()('https://a.de/prospekt.pdf')
    expect(antwort.text).toBe('')
  })

  /**
   * Der Bestand enthaelt Filialen derselben Firma (Lütz 4x, Urbach 3x). Ohne
   * Cache wird dieselbe Startseite viermal geholt — unnoetige Last auf einem
   * fremden Server und 3x2s Drosselzeit ohne Nutzen.
   */
  it('holt eine schon abgerufene URL nicht erneut', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'inhalt' }
    const hole = holer({ cachen: true })

    const eins = await hole('https://a.de/')
    const zwei = await hole('https://a.de/')

    expect(aufrufe).toHaveLength(1)
    expect(zwei).toEqual(eins)
    expect(gewartet).toHaveLength(0)   // kein Drosseln fuer einen Cache-Treffer
  })

  it('cacht nicht, wenn es nicht verlangt ist', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'inhalt' }
    const hole = holer()
    await hole('https://a.de/')
    await hole('https://a.de/')
    expect(aufrufe).toHaveLength(2)
  })

  it('begrenzt den Cache, statt unbegrenzt zu wachsen', async () => {
    const hole = holer({ cachen: true, cacheMax: 2 })
    for (const p of ['a', 'b', 'c']) {
      antworten[`https://x.de/${p}`] = { status: 200, body: p }
      await hole(`https://x.de/${p}`)
    }
    await hole('https://x.de/a')          // aeltester Eintrag wurde verdraengt
    expect(aufrufe.filter((a) => a.url.endsWith('/a'))).toHaveLength(2)
  })

  it('schneidet uebergrosse Seiten ab', async () => {
    antworten['https://a.de/'] = { status: 200, body: 'x'.repeat(3_000_000) }
    const antwort = await holer()('https://a.de/')
    expect(antwort.text.length).toBe(2_000_000)
  })
})
