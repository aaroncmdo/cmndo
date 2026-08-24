import { beforeEach, describe, expect, it } from 'vitest'
import { messeWeb, WEB_PUNKTE } from '../web'
import { pruefeBefunde } from '../../validator'
import type { Antwort } from '../../../anreicherung/lauf'
import type { Messkontext } from '../../modul-vertrag'
import type { PlacesAdapter } from '../../../places'

const JETZT = '2026-08-18T20:00:00.000Z'
let seiten: Record<string, Antwort> = {}
let abgerufen: string[] = []

const hole = async (url: string): Promise<Antwort> => {
  abgerufen.push(url)
  return seiten[url] ?? { status: 404, text: '' }
}

const places = {} as PlacesAdapter

function ctx(over: Partial<Messkontext> = {}): Messkontext {
  return {
    modus: 'bestand', websiteUrl: 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.62, ort: 'Münster', plz: '48143' },
    hole, places, jetzt: () => JETZT, ...over,
  }
}

const VOLLSTAENDIG = `<!doctype html><html><head>
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head><body>
  <a href="/impressum">Impressum</a>
  <a href="/datenschutz">Datenschutzerklärung</a>
</body></html>`

beforeEach(() => {
  seiten = {}
  abgerufen = []
})

describe('messeWeb', () => {
  it('vergibt bei vollstaendiger Seite die volle Punktzahl', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG, dauerMs: 300 }

    const r = await messeWeb(ctx())
    const p = pruefeBefunde(r.befunde)

    expect(p.fehlstellen).toHaveLength(0)        // alle Befunde erfuellen R-A/R-B
    expect(p.istPunkte).toBe(WEB_PUNKTE)
    expect(p.maxPunkte).toBe(WEB_PUNKTE)
  })

  it('belegt jeden Befund mit Quelle und Zeitpunkt (R-A)', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG }

    const r = await messeWeb(ctx())
    for (const b of r.befunde) {
      expect(b.quelle).toBeTruthy()
      expect(b.erhoben).toBe(JETZT)
    }
  })

  it('erkennt ein fehlendes Impressum — gesetzliche Pflicht nach §5 TMG', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: '<html><body>nur Text</body></html>' }

    const r = await messeWeb(ctx())
    const imp = r.befunde.find((b) => b.schluessel === 'impressum')

    expect(imp?.wert).toBe(false)
    expect(imp?.punkte).toBe(0)
    expect(imp?.ampel).toBe('rot')
    expect(imp?.einordnung).toContain('TMG')
  })

  it('erkennt eine fehlende Datenschutzerklaerung', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: '<a href="/impressum">Impressum</a>' }

    const r = await messeWeb(ctx())
    expect(r.befunde.find((b) => b.schluessel === 'datenschutz')?.punkte).toBe(0)
  })

  it('erkennt die Links auch bei abweichender Schreibweise', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text:
      '<a href="/imprint">Imprint</a><a href="/privacy-policy">Privacy</a>' }

    const r = await messeWeb(ctx())
    expect(r.befunde.find((b) => b.schluessel === 'impressum')?.wert).toBe(true)
    expect(r.befunde.find((b) => b.schluessel === 'datenschutz')?.wert).toBe(true)
  })

  it('wertet http als fehlendes HTTPS', async () => {
    seiten['http://alt.de/robots.txt'] = { status: 200, text: '' }
    seiten['http://alt.de'] = { status: 200, text: VOLLSTAENDIG }

    const r = await messeWeb(ctx({ websiteUrl: 'http://alt.de' }))
    const https = r.befunde.find((b) => b.schluessel === 'https')

    expect(https?.wert).toBe(false)
    expect(https?.punkte).toBe(0)
  })

  /**
   * R-B: Eine unerreichbare Seite ist NICHT „0 Punkte in allen Kriterien".
   * Das saehe im Balkendiagramm aus wie eine katastrophal schlechte Website —
   * gemessen wurde aber gar nichts.
   */
  it('macht aus einer unerreichbaren Seite Fehlstellen, keine Nullwerte', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 0, text: '' }

    const r = await messeWeb(ctx())

    expect(r.fehlstellen.length).toBeGreaterThan(0)
    expect(r.befunde.filter((b) => b.wert !== null)).toHaveLength(0)
    // und die Fehlstellen nennen den Grund
    expect(r.fehlstellen[0].grund).toBeTruthy()
  })

  it('respektiert robots.txt und meldet die Sperre als Grund (R-G)', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: 'User-agent: *\nDisallow: /' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG }

    const r = await messeWeb(ctx())

    expect(abgerufen).not.toContain('https://meyer.de')
    expect(r.fehlstellen[0].grund).toContain('robots.txt')
  })

  it('meldet eine Fehlstelle, wenn gar keine Website hinterlegt ist', async () => {
    const r = await messeWeb(ctx({ websiteUrl: null }))
    expect(r.befunde).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('keine Website')
    expect(abgerufen).toHaveLength(0)
  })

  it('bewertet die Antwortzeit und nennt sie als Wert', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG, dauerMs: 420 }

    const r = await messeWeb(ctx())
    const zeit = r.befunde.find((b) => b.schluessel === 'antwortzeit')

    expect(zeit?.wert).toBe(420)
    expect(zeit?.punkte).toBe(2)         // unter 800 ms = volle Punkte
  })

  it('stuft eine langsame Seite ab', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG, dauerMs: 4000 }

    const r = await messeWeb(ctx())
    expect(r.befunde.find((b) => b.schluessel === 'antwortzeit')?.punkte).toBe(0)
  })

  /**
   * ⚠ `null <= 800` ist in JavaScript **true**. Ohne eigene Behandlung bekaeme
   * eine FEHLENDE Zeitmessung die volle Punktzahl — ein Wert, den niemand
   * erhoben hat (R-B).
   */
  it('gibt fuer eine fehlende Zeitmessung keine Punkte, sondern einen Grund', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG }   // ohne dauerMs

    const r = await messeWeb(ctx())
    const zeit = r.befunde.find((b) => b.schluessel === 'antwortzeit')

    expect(zeit?.wert).toBeNull()
    expect(zeit?.punkte).toBe(0)
    expect(zeit?.grund).toBeTruthy()
  })

  /**
   * ⚠ Am echten Lauf gefunden (19.08., gutachter-yigit.com): eine React-SPA
   * liefert serverseitig 13 KB HTML mit **53 Bytes** sichtbarem Text und
   * keinem einzigen Navigationslink — Impressum und Datenschutz werden per
   * JavaScript nachgeladen.
   *
   * Ohne Sonderbehandlung wirft der Check dem Betrieb einen Verstoß gegen
   * § 5 TMG vor, den es nicht gibt. Ein falscher Abmahn-Vorwurf ist der
   * schädlichste Fehler, den dieses Produkt machen kann. Nicht feststellbar
   * ist NICHT dasselbe wie nicht vorhanden (R-B).
   */
  it('meldet Impressum bei einer SPA als nicht feststellbar, NICHT als fehlend', async () => {
    // 13 KB Markup, praktisch kein sichtbarer Text — das Muster einer SPA
    const spa = `<!doctype html><html><head>
      <meta name="viewport" content="width=device-width">
      ${'<link rel="preload" href="/static/chunk.js">'.repeat(120)}
      </head><body><div id="root"></div>
      ${'<script src="/static/js/main.js"></script>'.repeat(8)}
      </body></html>`
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: spa, dauerMs: 200 }

    const r = await messeWeb(ctx())
    const imp = r.befunde.find((b) => b.schluessel === 'impressum')
    const dat = r.befunde.find((b) => b.schluessel === 'datenschutz')

    expect(imp?.wert).toBeNull()
    expect(imp?.grund).toContain('JavaScript')
    expect(dat?.wert).toBeNull()
    // Die technischen Kriterien bleiben messbar — sie haengen nicht am Inhalt
    expect(r.befunde.find((b) => b.schluessel === 'https')?.wert).toBe(true)
    expect(r.befunde.find((b) => b.schluessel === 'antwortzeit')?.wert).toBe(200)
    expect(r.befunde.find((b) => b.schluessel === 'mobil')?.wert).toBe(true)
  })

  it('haelt eine kurze, aber serverseitig gerenderte Seite NICHT fuer eine SPA', async () => {
    const knapp = `<html><head><meta name="viewport" content="w"></head><body>
      <p>Kfz-Sachverständigenbüro Meyer, Hafenweg 3, 48143 Münster. Wir erstellen
      Schadengutachten und Wertgutachten für Privat und Gewerbe.</p>
      <a href="/impressum">Impressum</a></body></html>`
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: knapp, dauerMs: 200 }

    const r = await messeWeb(ctx())
    expect(r.befunde.find((b) => b.schluessel === 'impressum')?.wert).toBe(true)
    expect(r.befunde.find((b) => b.schluessel === 'datenschutz')?.wert).toBe(false)
  })

  it('erkennt eine fehlende Viewport-Angabe', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: '<html><body>ohne viewport</body></html>' }

    const r = await messeWeb(ctx())
    expect(r.befunde.find((b) => b.schluessel === 'mobil')?.wert).toBe(false)
  })

  it('summiert die Maxima auf die Modulpunkte der Registry', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: VOLLSTAENDIG, dauerMs: 300 }

    const r = await messeWeb(ctx())
    expect(r.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(WEB_PUNKTE)
  })
})
