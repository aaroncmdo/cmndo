import { beforeEach, describe, expect, it } from 'vitest'
import { messeKi, KI_PUNKTE, GEWICHTE } from '../ki'
import { pruefeBefunde } from '../../validator'
import type { Antwort } from '../../../anreicherung/lauf'
import type { Befund, Messergebnis, Messkontext } from '../../modul-vertrag'
import type { PlacesAdapter } from '../../../places'

const JETZT = '2026-08-24T20:00:00.000Z'
let seiten: Record<string, Antwort> = {}

const hole = async (url: string): Promise<Antwort> => seiten[url] ?? { status: 404, text: '' }
const places = {} as PlacesAdapter

function ctx(over: Partial<Messkontext> = {}): Messkontext {
  return {
    modus: 'bestand', websiteUrl: 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.62, ort: 'Münster', plz: '48143' },
    hole, places, jetzt: () => JETZT, ...over,
  }
}

const wert = (r: Messergebnis, s: string): Befund | undefined =>
  r.befunde.find((b) => b.schluessel === s)

// Genug sichtbarer Text, damit `istClientseitig` NICHT anschlaegt — sonst
// misst der Test das falsche Kriterium.
const TEXT = 'Kfz-Sachverständigenbüro Meyer in Münster. Wir erstellen Gutachten nach '
  + 'Verkehrsunfällen, bewerten Fahrzeuge und begleiten Sie bei der Abwicklung mit der '
  + 'gegnerischen Versicherung. Unsere Sachverständigen kommen zu dem Ort, an dem Ihr '
  + 'Fahrzeug steht — auch in die Werkstatt oder zu Ihnen nach Hause.'

const MIT_FAQ = `<!doctype html><html><body>
  <h1>Kfz-Gutachten Münster</h1><p>${TEXT}</p>
  <h2>Was kostet ein Gutachten?</h2><p>${TEXT}</p>
  <script type="application/ld+json">
    {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[]}
  </script>
</body></html>`

const MIT_FRAGEN = `<!doctype html><html><body>
  <h1>Kfz-Gutachten Münster</h1><p>${TEXT}</p>
  <h2>Was kostet ein Gutachten?</h2><p>${TEXT}</p>
  <h2>Wer zahlt den Sachverständigen?</h2><p>${TEXT}</p>
  <h3>Wie lange dauert die Erstellung?</h3><p>${TEXT}</p>
</body></html>`

const OHNE_FRAGEN = `<!doctype html><html><body>
  <h1>Kfz-Gutachten Münster</h1><p>${TEXT}</p>
  <h2>Über unser Büro</h2><p>${TEXT}</p>
  <h2>Unsere Leistungen</h2><p>${TEXT}</p>
</body></html>`

beforeEach(() => { seiten = {} })

describe('messeKi', () => {
  it('vergibt die volle Punktzahl bei offenem Zugang, HTML-Inhalt und FAQ-Daten', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: 'User-agent: *\nAllow: /' }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    const p = pruefeBefunde(r.befunde)

    expect(p.fehlstellen).toHaveLength(0)
    expect(p.istPunkte).toBe(KI_PUNKTE)
    expect(p.maxPunkte).toBe(KI_PUNKTE)
  })

  it('behandelt eine fehlende robots.txt als „keine Sperre"', async () => {
    // 404 ist der Normalfall bei kleinen Betriebsseiten und darf nicht
    // aussehen wie eine Sperre.
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    expect(wert(r, 'zugang')?.punkte).toBe(GEWICHTE.zugang)
  })

  it('zieht Punkte ab, wenn ein Dienst ausgesperrt ist', async () => {
    seiten['https://meyer.de/robots.txt'] = {
      status: 200,
      text: 'User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nDisallow: /',
    }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    const b = wert(r, 'zugang')
    expect(b?.punkte).toBeLessThan(GEWICHTE.zugang)
    expect(String(b?.einordnung)).toContain('GPTBot')
  })

  it('gibt null Zugangspunkte, wenn alle Dienste gesperrt sind', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: 'User-agent: *\nDisallow: /' }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    expect(wert(r, 'zugang')?.punkte).toBe(0)
    expect(wert(r, 'zugang')?.ampel).toBe('rot')
  })

  it('erkennt eine clientseitig gerenderte Seite als unlesbar', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = {
      status: 200,
      text: '<!doctype html><html><body><div id="root"></div>'
        + `<script>${'const x=1;'.repeat(200)}</script></body></html>`,
    }

    const r = await messeKi(ctx())
    expect(wert(r, 'im_html')?.punkte).toBe(0)
    expect(String(wert(r, 'im_html')?.einordnung)).toContain('JavaScript')
  })

  it('wertet Frage-Ueberschriften niedriger als einen FAQ-Datenblock', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FRAGEN }

    const r = await messeKi(ctx())
    const punkte = wert(r, 'antworten')?.punkte ?? 0
    expect(punkte).toBeGreaterThan(0)
    expect(punkte).toBeLessThan(GEWICHTE.antworten)
  })

  it('gibt null Punkte, wenn keine Ueberschrift eine Frage stellt', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: OHNE_FRAGEN }

    const r = await messeKi(ctx())
    expect(wert(r, 'antworten')?.punkte).toBe(0)
  })

  it('meldet ohne Website eine Fehlstelle statt null Punkten (R-B)', async () => {
    const r = await messeKi(ctx({ websiteUrl: null }))
    expect(r.befunde).toHaveLength(0)
    expect(r.fehlstellen).toHaveLength(1)
  })

  it('meldet eine unerreichbare robots.txt als nicht erhoben, nicht als Sperre', async () => {
    // ⚠ Ein Serverfehler ist keine Aussage ueber den Zugang. Null Punkte waeren
    // hier eine Behauptung (R-B).
    seiten['https://meyer.de/robots.txt'] = { status: 500, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    const b = wert(r, 'zugang')
    expect(b?.wert).toBeNull()
    expect(b?.ampel).toBe('offen')
  })

  it('meldet eine unerreichbare Startseite als nicht erhoben', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 0, text: '' }

    const r = await messeKi(ctx())
    expect(wert(r, 'im_html')?.wert).toBeNull()
    expect(wert(r, 'antworten')?.wert).toBeNull()
  })

  it('belegt jeden Befund mit Quelle und Zeitpunkt (R-A)', async () => {
    seiten['https://meyer.de/robots.txt'] = { status: 200, text: '' }
    seiten['https://meyer.de'] = { status: 200, text: MIT_FAQ }

    const r = await messeKi(ctx())
    for (const b of r.befunde) {
      expect(b.quelle).toBeTruthy()
      expect(b.erhoben).toBe(JETZT)
    }
  })

  it('haelt die Summe der Gewichte auf der Modulpunktzahl', () => {
    const summe = Object.values(GEWICHTE).reduce((s, n) => s + n, 0)
    expect(summe).toBe(KI_PUNKTE)
  })
})
