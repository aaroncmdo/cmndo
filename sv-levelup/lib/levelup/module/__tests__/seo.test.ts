import { describe, expect, it } from 'vitest'
import type { Messkontext } from '../../modul-vertrag'
import { SEO_PUNKTE, messeSeo } from '../seo'

function kontext(html: string | null, ort = 'Münster'): Messkontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort, plz: '48143' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places: {} as never,
    jetzt: () => '2026-08-19T10:00:00.000Z',
  } as unknown as Messkontext
}

const GUT = `<html><head>
  <title>Kfz-Gutachter Münster — Sachverständigenbüro Meyer</title>
  <meta name="description" content="Unabhängiges Kfz-Sachverständigenbüro in Münster. Unfallgutachten, Wertgutachten und Beweissicherung — kurzfristige Termine im gesamten Münsterland.">
  <script type="application/ld+json">{"@type":"LocalBusiness","name":"Meyer"}</script>
  </head><body><h1>Ihr Kfz-Gutachter in Münster</h1>
  <p>${'Wir erstellen Gutachten in Münster und Umgebung. '.repeat(30)}</p>
  </body></html>`

describe('messeSeo', () => {
  it('vergibt die volle Punktzahl fuer eine vollstaendige Seite', async () => {
    const e = await messeSeo(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(SEO_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeSeo(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(SEO_PUNKTE)
  })

  it('erkennt einen fehlenden Ortsbezug im Titel', async () => {
    const ohneOrt = GUT.replace('Kfz-Gutachter Münster — Sachverständigenbüro Meyer', 'Herzlich willkommen auf unserer Internetseite')
    const e = await messeSeo(kontext(ohneOrt))
    const titel = e.befunde.find((b) => b.schluessel === 'titel')!
    expect(titel.punkte).toBeLessThan(3)
    expect(String(titel.einordnung)).toContain('Münster')
  })

  it('findet den Ortsbezug auch bei einem Umlaut als Entity', async () => {
    // „M&uuml;nster" im Quelltext ist derselbe Ort — ohne Entity-Deutung
    // faende die Pruefung ihn nicht und wuerfe der Seite etwas Falsches vor.
    const alsEntity = GUT.replace(/Münster/g, 'M&uuml;nster')
    const e = await messeSeo(kontext(alsEntity))
    expect(e.befunde.find((b) => b.schluessel === 'ortsbezug')!.wert).toBe(true)
  })

  it('zaehlt mehrere Hauptueberschriften als Mangel', async () => {
    const zwei = GUT.replace('</body>', '<h1>Noch eine</h1></body>')
    const e = await messeSeo(kontext(zwei))
    expect(e.befunde.find((b) => b.schluessel === 'h1')!.punkte).toBe(0)
  })

  it('erkennt eine fehlende Beschreibung', async () => {
    const ohne = GUT.replace(/<meta name="description"[^>]*>/, '')
    const e = await messeSeo(kontext(ohne))
    expect(e.befunde.find((b) => b.schluessel === 'beschreibung')!.punkte).toBe(0)
  })

  it('verwechselt die Beschreibung nicht mit einem anderen meta-Element', async () => {
    // ⚠ `attribut(html,'meta','content')` liefert die content-Werte ALLER
    // meta-Elemente. Wer sie ueber den Listenplatz zuordnet, ordnet falsch,
    // sobald ein meta ohne content dazwischensteht.
    const verschoben = GUT.replace('<meta name="description"',
      '<meta charset="utf-8"><meta property="og:title" content="Etwas ganz anderes"><meta name="description"')
    const e = await messeSeo(kontext(verschoben))
    const b = e.befunde.find((x) => x.schluessel === 'beschreibung')!
    expect(String(b.wert)).toContain('Unabhängiges')
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><head><title>App</title></head><body><div id="root"></div>' +
      '<script src="/bundle.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeSeo(kontext(spa))
    // ⚠ Der teuerste Fehler des Projekts war, einer React-Seite fehlendes
    // Impressum vorzuwerfen. Hier dasselbe Muster fuer h1 und Ortsbezug.
    for (const s of ['h1', 'ortsbezug'] as const) {
      const b = e.befunde.find((x) => x.schluessel === s)!
      expect(b.wert).toBeNull()
      expect(b.grund).toBeTruthy()
    }
    // Titel und Beschreibung stehen im Kopf und bleiben messbar.
    expect(e.befunde.find((b) => b.schluessel === 'titel')!.wert).not.toBeNull()
  })

  it('meldet eine Fehlstelle statt Nullen, wenn keine Website hinterlegt ist', async () => {
    const e = await messeSeo(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.befunde.filter((b) => b.wert !== null)).toHaveLength(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeSeo(kontext(GUT))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
