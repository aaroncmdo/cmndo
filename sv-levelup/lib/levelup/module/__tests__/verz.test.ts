import { describe, expect, it } from 'vitest'
import type { Betrieb, PlacesAdapter, Profil } from '../../../places'
import type { Messkontext } from '../../modul-vertrag'
import { VERZ_PUNKTE, adressTeile, messeVerz, nurZiffern } from '../verz'

const PROFIL: Profil = {
  placeId: 'p1', name: 'Sachverständigenbüro Meyer',
  adresse: 'Weseler Str. 675 B, 48163 Münster, Deutschland',
  lat: 51.9, lng: 7.6, website: 'https://meyer.de', bewertung: 5, bewertungen: 42,
  fotos: 8, oeffnungszeiten: true, telefon: '0251 30179898', betriebsstatus: 'OPERATIONAL',
}

const EIGENER: Betrieb = {
  placeId: 'p1', name: 'Sachverständigenbüro Meyer', adresse: PROFIL.adresse,
  lat: 51.9, lng: 7.6, website: null, bewertung: 5, bewertungen: 42,
}

function adapter(profil: Profil | null): PlacesAdapter {
  return {
    suchText: async () => (profil ? [EIGENER] : []),
    suchUmkreis: async () => [],
    details: async () => null,
    profil: async () => profil,
  }
}

type Kontext = Messkontext & { firmenname?: string | null }

function kontext(html: string | null, profil: Profil | null = PROFIL): Kontext {
  return {
    modus: 'bestand',
    websiteUrl: html === null ? null : 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.63, ort: 'Münster', plz: '48163' },
    hole: async () => html === null
      ? { ok: false, status: 0, fehler: 'kein Abruf', dauerMs: 0 }
      : { ok: true, status: 200, text: html, dauerMs: 120 },
    places: adapter(profil),
    jetzt: () => '2026-08-19T10:00:00.000Z',
    firmenname: 'Sachverständigenbüro Meyer',
  } as unknown as Kontext
}

const GUT = `<html><body>
  <h1>Sachverständigenbüro Meyer</h1>
  <p>${'Wir begutachten Unfallschäden im Münsterland. '.repeat(30)}</p>
  <address>Sachverständigenbüro Meyer<br>Weseler Str. 675 B<br>48163 Münster</address>
  <p>Telefon: 0251 / 30 17 98 98</p>
  </body></html>`

describe('nurZiffern', () => {
  it('macht aus verschiedenen Schreibweisen dieselbe Zahl', () => {
    expect(nurZiffern('0251 / 30 17 98 98')).toBe('02513017989 8'.replace(' ', ''))
    expect(nurZiffern('+49 251 30179898')).toBe('025130179898')
    expect(nurZiffern('0251-30179898')).toBe('025130179898')
  })
})

describe('adressTeile', () => {
  it('liest Postleitzahl und Straße', () => {
    const t = adressTeile('Weseler Str. 675 B, 48163 Münster, Deutschland')
    expect(t.plz).toBe('48163')
    expect(t.strasse?.toLowerCase()).toContain('weseler str')
    expect(t.strasse).toContain('675')
  })

  it('kommt mit Umlauten und Bindestrichen im Straßennamen zurecht', () => {
    const t = adressTeile('Von-Steuben-Straße 12, 48143 Münster')
    expect(t.strasse?.toLowerCase()).toContain('steuben')
    expect(t.plz).toBe('48143')
  })

  it('liefert null, wo nichts steht', () => {
    expect(adressTeile('Impressum').plz).toBeNull()
    expect(adressTeile('Impressum').strasse).toBeNull()
  })
})

describe('messeVerz', () => {
  it('vergibt die volle Punktzahl, wenn alle Angaben übereinstimmen', async () => {
    const e = await messeVerz(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.punkte, 0)).toBe(VERZ_PUNKTE)
  })

  it('summiert die Hoechstpunkte genau auf die Modulpunktzahl', async () => {
    const e = await messeVerz(kontext(GUT))
    expect(e.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(VERZ_PUNKTE)
  })

  it('akzeptiert dieselbe Nummer in anderer Schreibweise', async () => {
    // ⚠ „0251 / 30 17 98 98" und „0251 30179898" sind dieselbe Nummer. Wer
    // Zeichenketten vergleicht, meldet hier einen Widerspruch, den es nicht
    // gibt — und der Sachverstaendige sucht einen Fehler in seinen Daten.
    const e = await messeVerz(kontext(GUT))
    expect(e.befunde.find((b) => b.schluessel === 'telefonGleich')!.punkte).toBeGreaterThan(0)
  })

  it('erkennt eine abweichende Adresse', async () => {
    const umgezogen = GUT.replace('Weseler Str. 675 B', 'Hafenweg 12').replace('48163', '48155')
    const e = await messeVerz(kontext(umgezogen))
    const b = e.befunde.find((x) => x.schluessel === 'adresseGleich')!
    expect(b.punkte).toBe(0)
    // Der Befund muss BEIDE Fassungen nennen — sonst weiss niemand, welche stimmt.
    expect(String(b.einordnung)).toContain('48155')
    expect(String(b.einordnung)).toContain('48163')
  })

  it('misst die Adresse auch ohne Profil und meldet die Vergleiche als Fehlstelle', async () => {
    const e = await messeVerz(kontext(GUT, null))
    // Ohne Profil gibt es nichts zu vergleichen — aber ob eine Adresse auf der
    // Website steht, bleibt messbar.
    expect(e.befunde.find((b) => b.schluessel === 'adresseDa')!.wert).toBe(true)
    for (const s of ['adresseGleich', 'telefonGleich', 'nameGleich'] as const) {
      const b = e.befunde.find((x) => x.schluessel === s)!
      expect(b.wert).toBeNull()
      expect(b.grund).toBeTruthy()
    }
  })

  it('erkennt eine fehlende Adresse auf der Website', async () => {
    const ohne = GUT.replace(/<address>[\s\S]*?<\/address>/, '')
    const e = await messeVerz(kontext(ohne))
    expect(e.befunde.find((b) => b.schluessel === 'adresseDa')!.wert).toBe(false)
  })

  it('wirft nichts vor, wenn die Straße kein erkennbares Suffix hat', async () => {
    // ⚠ „Am Mittelhafen 10" ist eine echte Muensteraner Anschrift ohne
    // „-straße" oder „-weg". Der Ausdruck findet sie nicht — daraus „keine
    // Anschrift" zu folgern, waere ein falscher Vorwurf. Es gibt also DREI
    // Faelle: gefunden, nachweislich nicht da, und nicht feststellbar (R-B).
    const ohneSuffix = GUT.replace('Weseler Str. 675 B', 'Am Mittelhafen 10')
    const e = await messeVerz(kontext(ohneSuffix))
    const b = e.befunde.find((x) => x.schluessel === 'adresseDa')!
    expect(b.wert).toBeNull()
    expect(String(b.grund)).toContain('48163')
  })

  it('wirft einer clientseitigen Anwendung NICHTS vor', async () => {
    const spa = '<html><body><div id="root"></div>' + '<script src="/b.js"></script>'.repeat(50) + '</body></html>'
    const e = await messeVerz(kontext(spa))
    expect(e.befunde.every((b) => b.wert === null)).toBe(true)
    expect(e.befunde.every((b) => Boolean(b.grund))).toBe(true)
  })

  it('meldet eine Fehlstelle, wenn keine Website hinterlegt ist', async () => {
    const e = await messeVerz(kontext(null))
    expect(e.fehlstellen.length).toBeGreaterThan(0)
    expect(e.befunde).toHaveLength(0)
  })

  it('nennt an jedem Befund Quelle und Zeitpunkt (R-A)', async () => {
    const e = await messeVerz(kontext(GUT))
    expect(e.befunde.every((b) => b.quelle.length > 0 && b.erhoben.length > 0)).toBe(true)
  })
})
