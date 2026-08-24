import { describe, expect, it } from 'vitest'
import type { Messkontext } from '../../modul-vertrag'
import { NACH_PUNKTE, THEMEN, messeNach, themaBehandelt } from '../nach'

function kontext(html: string | null): Messkontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48143' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places: {} as never,
    jetzt: () => '2026-08-19T10:00:00.000Z',
  } as unknown as Messkontext
}

const ALLES = `<html><body>
  <h1>Ihr Kfz-Gutachter</h1>
  <h2>Wer zahlt das Gutachten?</h2>
  <p>Bei unverschuldetem Unfall trägt die Haftpflicht des Gegners die Kostenübernahme — für Sie kostenlos.</p>
  <h2>Wertminderung</h2><p>Die merkantile Wertminderung berechnen wir mit.</p>
  <h2>Nutzungsausfall</h2><p>Statt Mietwagen können Sie Nutzungsausfall geltend machen.</p>
  <h2>Restwert</h2><p>Wir ermitteln Restwert und Wiederbeschaffungswert.</p>
  <h2>Ablauf</h2><p>Wie lange dauert es? In der Regel 2 Tage.</p>
  <h2>Freie Wahl</h2><p>Sie bestimmen, wer begutachtet — die Versicherung darf Ihnen niemanden vorschreiben.</p>
  <h2>Totalschaden</h2><p>Reparaturkosten über 130 % bedeuten wirtschaftlicher Totalschaden.</p>
  <h2>Kaskoschaden</h2><p>Auch bei Teilkasko und Vollkasko begutachten wir.</p>
  <p>${'Wir sind für Sie da. '.repeat(30)}</p>
  </body></html>`

describe('themaBehandelt', () => {
  it('zaehlt ein einzelnes Wort im Fliesstext NICHT', () => {
    // ⚠ Ohne diese Huerde zaehlte „Kasko" in einer Aufzaehlung als behandeltes
    // Thema, und der Befund lobte eine Seite fuer Inhalte, die sie nicht hat.
    expect(themaBehandelt('Wir prüfen Haftpflicht, Kasko und mehr.', '', [/teilkasko/i, /vollkasko/i, /kaskoschaden/i]))
      .toBe(false)
  })

  it('zaehlt zwei Begriffe im Fliesstext', () => {
    expect(themaBehandelt('Bei Teilkasko und Vollkasko helfen wir.', '', [/teilkasko/i, /vollkasko/i]))
      .toBe(true)
  })

  it('zaehlt einen Begriff in einer Ueberschrift', () => {
    expect(themaBehandelt('kaum Text', 'Kaskoschaden', [/kaskoschaden/i])).toBe(true)
  })
})

describe('messeNach', () => {
  it('vergibt die volle Punktzahl fuer eine Seite mit allen acht Themen', async () => {
    const e = await messeNach(kontext(ALLES))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(NACH_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeNach(kontext(ALLES))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(NACH_PUNKTE)
    expect(e.befunde).toHaveLength(THEMEN.length)
  })

  it('erkennt fehlende Themen einzeln', async () => {
    const ohneKasko = ALLES.replace(/<h2>Kaskoschaden<\/h2><p>[\s\S]*?<\/p>/, '')
    const e = await messeNach(kontext(ohneKasko))
    expect(e.befunde.find((b) => b.schluessel === 'kasko')!.wert).toBe(false)
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(NACH_PUNKTE - 1)
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><body><div id="root"></div>' + '<script src="/b.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeNach(kontext(spa))
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => Boolean(b.grund))).toBe(true)
  })

  it('meldet eine Fehlstelle, wenn keine Website hinterlegt ist', async () => {
    const e = await messeNach(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeNach(kontext(ALLES))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
