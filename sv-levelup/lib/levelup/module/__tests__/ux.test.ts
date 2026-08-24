import { describe, expect, it } from 'vitest'
import type { Messkontext } from '../../modul-vertrag'
import { UX_PUNKTE, messeUx } from '../ux'

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

const GUT = `<html><body>
  <a href="tel:+492511234567">0251 1234567</a>
  <p>Erreichbar Montag bis Freitag 08:00–18:00 Uhr, im Notfall rund um die Uhr.</p>
  <form action="/kontakt"><input name="name"><button>Senden</button></form>
  ${'<p>Wir begutachten Ihren Unfallschaden schnell und unabhängig.</p>'.repeat(40)}
  </body></html>`

describe('messeUx', () => {
  it('vergibt die volle Punktzahl fuer eine erreichbare Seite', async () => {
    const e = await messeUx(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(UX_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeUx(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(UX_PUNKTE)
  })

  it('unterscheidet eine nicht verlinkte Nummer von einer fehlenden', async () => {
    const ohneLink = GUT.replace('<a href="tel:+492511234567">0251 1234567</a>', '<span>0251 1234567</span>')
    const e = await messeUx(kontext(ohneLink))
    const t = e.befunde.find((b) => b.schluessel === 'telefonLink')!
    expect(t.punkte).toBe(0)
    // Die Nummer STEHT da — der Befund muss den Unterschied benennen, sonst
    // liest der Sachverstaendige „keine Telefonnummer" und haelt uns fuer blind.
    expect(String(t.einordnung)).toContain('nicht verlinkt')
  })

  it('meldet eine fehlende Nummer anders als eine unverlinkte', async () => {
    const ohneNummer = GUT
      .replace('<a href="tel:+492511234567">0251 1234567</a>', '')
      .replace('08:00–18:00', 'vormittags bis abends')
    const e = await messeUx(kontext(ohneNummer))
    const t = e.befunde.find((b) => b.schluessel === 'telefonLink')!
    expect(String(t.einordnung)).toContain('Keine Telefonnummer')
  })

  it('erkennt einen fehlenden zweiten Kontaktweg', async () => {
    const ohneFormular = GUT.replace(/<form[\s\S]*?<\/form>/, '')
    const e = await messeUx(kontext(ohneFormular))
    expect(e.befunde.find((b) => b.schluessel === 'kontaktweg')!.punkte).toBe(0)
  })

  it('nimmt eine verlinkte E-Mail-Adresse als zweiten Weg an', async () => {
    const mitMail = GUT.replace(/<form[\s\S]*?<\/form>/, '<a href="mailto:info@meyer.de">Schreiben Sie uns</a>')
    const e = await messeUx(kontext(mitMail))
    expect(e.befunde.find((b) => b.schluessel === 'kontaktweg')!.punkte).toBeGreaterThan(0)
  })

  it('merkt, wenn die Nummer erst weit unten steht', async () => {
    const spaet = '<html><body>' +
      '<p>Wir sind ein Sachverständigenbüro mit langer Erfahrung im Bereich der Unfallbegutachtung. </p>'.repeat(40) +
      '<a href="tel:+492511234567">0251 1234567</a><form></form>' +
      '<p>Montag bis Freitag 08:00–18:00 Uhr, kurzfristige Termine.</p></body></html>'
    const e = await messeUx(kontext(spaet))
    expect(e.befunde.find((b) => b.schluessel === 'oben')!.punkte).toBe(0)
    // Der Kontaktweg selbst ist trotzdem da.
    expect(e.befunde.find((b) => b.schluessel === 'telefonLink')!.punkte).toBeGreaterThan(0)
  })

  it('erkennt eine Nummer ganz oben auch bei aufgeblaehtem Markup', async () => {
    // ⚠ Am echten Bestand gefunden (19.08.): Baukasten-Seiten liefern
    // eingebettetes CSS im Rumpf. `stanoksei.de` hat 1 MB HTML, in den ersten
    // 2500 Rumpf-Zeichen stehen 50 Zeichen Text — die Nummer bei 1 % der Seite
    // waere als „erst weiter unten" gemeldet worden. Der Vorwurf war falsch.
    const fuellung = '<div class="con-kit-row" style="' + 'padding:0;margin:0;'.repeat(40) + '"></div>'
    const aufgeblaeht = '<html><body>' + fuellung.repeat(30) +
      '<a href="tel:+492511234567">0251 1234567</a>' +
      '<p>Montag bis Freitag 08:00–18:00 Uhr, kurzfristige Termine.</p><form></form>' +
      // ⚠ Echter Text muss dazu: ohne ihn haelt `istClientseitig` die Seite
      // fuer eine Anwendung und misst zu Recht gar nichts — dann prueft der
      // Test nicht mehr das, wofuer er da ist.
      '<p>Wir begutachten Unfallschäden im gesamten Münsterland. </p>'.repeat(40) +
      fuellung.repeat(300) + '</body></html>'
    const e = await messeUx(kontext(aufgeblaeht))
    expect(e.befunde.find((b) => b.schluessel === 'oben')!.punkte).toBeGreaterThan(0)
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><body><div id="root"></div>' + '<script src="/b.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeUx(kontext(spa))
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => Boolean(b.grund))).toBe(true)
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(0)
  })

  it('meldet eine Fehlstelle, wenn keine Website hinterlegt ist', async () => {
    const e = await messeUx(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.befunde).toHaveLength(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeUx(kontext(GUT))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
