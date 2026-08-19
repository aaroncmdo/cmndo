import { beforeEach, describe, expect, it } from 'vitest'
import { messeWett, WETT_PUNKTE, GEWICHTE } from '../wett'
import { pruefeBefunde } from '../../validator'
import { PlacesFehler, type Betrieb, type PlacesAdapter } from '../../../places'
import type { Messkontext } from '../../modul-vertrag'
import type { Antwort } from '../../../anreicherung/lauf'

const JETZT = '2026-08-18T20:00:00.000Z'

let treffer: Betrieb[] = []
let wirft: Error | null = null
let abfragen: string[] = []

const places = {
  suchText: async (q: string) => {
    abfragen.push(q)
    if (wirft) throw wirft
    return treffer
  },
  suchUmkreis: async () => [],
  details: async () => null,
} as unknown as PlacesAdapter

const hole = async (): Promise<Antwort> => ({ status: 200, text: '' })

function ctx(over: Partial<Messkontext> & { firmenname?: string | null } = {}) {
  return {
    modus: 'bestand' as const, websiteUrl: 'https://meyer.de',
    standort: { lat: 51.96, lng: 7.62, ort: 'Münster', plz: '48143' },
    hole, places, jetzt: () => JETZT, ...over,
  }
}

function betrieb(name: string, bewertungen: number | null): Betrieb {
  return {
    placeId: `P-${name}`, name, adresse: null, lat: 51.9, lng: 7.6,
    website: null, bewertung: 4.5, bewertungen,
  }
}

/** Elf Betriebe: Bewertungen 0,10,20,…,100 → Median 50, oberes Viertel 80. */
const MARKT = Array.from({ length: 11 }, (_, i) => betrieb(`Buero ${i}`, i * 10))

beforeEach(() => {
  treffer = [...MARKT]
  wirft = null
  abfragen = []
})

describe('messeWett — Weg aufbau', () => {
  it('meldet 0 Punkte als ERGEBNIS und liefert das Marktbild', async () => {
    const r = await messeWett(ctx({ modus: 'aufbau' }))
    const p = pruefeBefunde(r.befunde)

    expect(p.istPunkte).toBe(0)
    expect(r.befunde.find((b) => b.schluessel === 'marktgroesse')?.wert).toBe(11)
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.wert).toBe('12. von 12')
  })

  it('nennt Median und oberes Viertel in der Einordnung', async () => {
    const r = await messeWett(ctx({ modus: 'aufbau' }))
    const m = r.befunde.find((b) => b.schluessel === 'marktgroesse')
    expect(m?.einordnung).toContain('Median 50')
    expect(m?.einordnung).toContain('oberes Viertel ab 80')
    // R-A: die Bezugsgruppe muss benannt sein, nicht nur die Zahl
    expect(m?.einordnung).toContain('11 gefundenen Büros')
  })

  it('braucht keinen Firmennamen', async () => {
    const r = await messeWett(ctx({ modus: 'aufbau', firmenname: null }))
    expect(pruefeBefunde(r.befunde).fehlstellen).toHaveLength(0)
  })
})

describe('messeWett — Weg bestand', () => {
  it('bestimmt den Rang nach Bewertungszahl', async () => {
    treffer = [...MARKT, betrieb('Sachverständigenbüro Meyer', 55)]
    const r = await messeWett(ctx({ firmenname: 'Sachverständigenbüro Meyer' }))

    // 55 Bewertungen: 5 Betriebe (60..100) sind besser -> Rang 6 von 12
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.wert).toBe('6. von 12')
    expect(r.befunde.find((b) => b.schluessel === 'sichtbar')?.punkte).toBe(GEWICHTE.sichtbar)
  })

  it('findet den eigenen Eintrag trotz abweichender Schreibweise', async () => {
    treffer = [...MARKT, betrieb('Sachverstaendigenbuero Meyer GmbH', 55)]
    const r = await messeWett(ctx({ firmenname: 'Sachverständigenbüro Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'sichtbar')?.wert).toBe(true)
  })

  /**
   * Am echten Lauf gefunden (18.08.): Der Betrieb steht bei Google als
   * „KFZ Sachverständigenbüro Berkay Yigit Münster", der Nutzer tippt
   * „Gutachter Yigit". Ein Substring-Vergleich scheitert daran, weil die
   * GATTUNGSWÖRTER verschieden sind — verglichen werden muss der Kern.
   */
  it('findet den Eintrag auch bei abweichendem Gattungswort', async () => {
    treffer = [...MARKT, betrieb('KFZ Sachverständigenbüro Berkay Yigit Münster', 55)]
    const r = await messeWett(ctx({ firmenname: 'Gutachter Yigit' }))
    expect(r.befunde.find((b) => b.schluessel === 'sichtbar')?.wert).toBe(true)
  })

  it('findet den Eintrag trotz Unicode-Schmuckschrift im Google-Namen', async () => {
    treffer = [...MARKT, betrieb('𝗞𝗙𝗭 𝗦𝗮𝗰𝗵𝘃𝗲𝗿𝘀𝘁ä𝗻𝗱𝗶𝗴𝗲𝗻𝗯ü𝗿𝗼 𝗕𝗲𝗿𝗸𝗮𝘆 𝗬𝗶𝗴𝗶𝘁', 55)]
    const r = await messeWett(ctx({ firmenname: 'Sachverständigenbüro Yigit' }))
    expect(r.befunde.find((b) => b.schluessel === 'sichtbar')?.wert).toBe(true)
  })

  /**
   * ⚠ Dieselbe Fehlerklasse zum dritten Mal: `'meyer'.includes('')` ist true.
   * Ein Betrieb, dessen Name nur aus Gattungswörtern besteht, hat einen LEEREN
   * Kern und würde sonst als jeder gesuchte Betrieb erkannt.
   */
  it('erkennt einen Betrieb mit leerem Namenskern NICHT als den gesuchten', async () => {
    treffer = [betrieb('Sachverständigenbüro', 0), betrieb('Kfz-Gutachter Meyer', 55)]
    const r = await messeWett(ctx({ firmenname: 'Sachverständigenbüro Meyer' }))
    // Muss den echten Meyer finden, nicht den namenlosen ersten Eintrag
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.wert).toBe('1. von 2')
  })

  it('verwechselt nicht zwei verschiedene Betriebe', async () => {
    treffer = [...MARKT, betrieb('Sachverständigenbüro Schmitz', 55)]
    const r = await messeWett(ctx({ firmenname: 'Sachverständigenbüro Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'sichtbar')?.wert).toBeNull()
  })

  it('gibt beim besten Betrieb die volle Rang-Punktzahl', async () => {
    treffer = [...MARKT, betrieb('Meyer', 999)]
    const r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.punkte).toBe(GEWICHTE.rang)
  })

  it('wertet ueber dem oberen Viertel voll, ueber dem Median halb', async () => {
    treffer = [...MARKT, betrieb('Meyer', 85)]
    let r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'median')?.punkte).toBe(GEWICHTE.median)

    treffer = [...MARKT, betrieb('Meyer', 55)]
    r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'median')?.punkte).toBe(2)

    treffer = [...MARKT, betrieb('Meyer', 5)]
    r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'median')?.punkte).toBe(0)
  })

  /**
   * Die Lücke, die `levelup_checks` heute hat: kein Firmenname. Sie muss als
   * Fehlstelle SICHTBAR sein — ein „Rang 0" wäre eine Aussage über den
   * Betrieb, die niemand erhoben hat (R-B).
   */
  it('macht aus dem fehlenden Firmennamen Fehlstellen, nicht einen schlechten Rang', async () => {
    const r = await messeWett(ctx({ firmenname: null }))

    const rang = r.befunde.find((b) => b.schluessel === 'rang')
    expect(rang?.wert).toBeNull()
    expect(rang?.grund).toContain('kein Firmenname')
    expect(pruefeBefunde(r.befunde).fehlstellen).toHaveLength(0)   // valide Nicht-Erhoben-Befunde
  })

  it('unterscheidet „nicht auffindbar" von „kein Name hinterlegt"', async () => {
    const r = await messeWett(ctx({ firmenname: 'Gibtesnichtbuero' }))
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.grund).toContain('nicht auffindbar')
  })

  it('meldet die Bewertungs-Dynamik beim Erstcheck als nicht bestimmbar', async () => {
    treffer = [...MARKT, betrieb('Meyer', 55)]
    const r = await messeWett(ctx({ firmenname: 'Meyer' }))
    const d = r.befunde.find((b) => b.schluessel === 'dynamik')

    expect(d?.wert).toBeNull()
    expect(d?.grund).toContain('zwei Messzeitpunkte')
  })
})

describe('messeWett — Fehlerfaelle', () => {
  /**
   * ⚠ Der wichtigste Test des Moduls: Ein gesperrter Schluessel darf nicht wie
   * ein leerer Markt aussehen. „0 Wettbewerber im 50-km-Umkreis" wäre für einen
   * Sachverständigen eine glaubwürdige und völlig falsche Aussage.
   */
  it('macht aus einem Places-Fehler eine Fehlstelle, NIE „0 Wettbewerber"', async () => {
    wirft = new PlacesFehler('REQUEST_DENIED', 'key blocked')
    const r = await messeWett(ctx({ firmenname: 'Meyer' }))

    expect(r.befunde).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('REQUEST_DENIED')
    expect(r.fehlstellen[0].grund).toContain('nicht erhoben')
  })

  it('meldet eine Fehlstelle ohne Standort', async () => {
    const r = await messeWett(ctx({ standort: null }))
    expect(r.befunde).toHaveLength(0)
    expect(r.fehlstellen[0].grund).toContain('Standort')
    expect(abfragen).toHaveLength(0)         // kein Abruf ohne Umkreis
  })

  it('kommt mit einem leeren Markt zurecht, ohne durch null zu teilen', async () => {
    treffer = []
    const r = await messeWett(ctx({ modus: 'aufbau' }))
    expect(pruefeBefunde(r.befunde).fehlstellen).toHaveLength(0)
    expect(r.befunde.find((b) => b.schluessel === 'marktgroesse')?.wert).toBe(0)
  })

  it('behandelt Betriebe ohne Bewertungszahl als 0, statt sie zu ueberspringen', async () => {
    treffer = [betrieb('A', null), betrieb('B', 10), betrieb('Meyer', 5)]
    const r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.find((b) => b.schluessel === 'rang')?.wert).toBe('2. von 3')
  })

  it('summiert die Maxima auf die Modulpunkte der Registry', async () => {
    treffer = [...MARKT, betrieb('Meyer', 55)]
    const r = await messeWett(ctx({ firmenname: 'Meyer' }))
    expect(r.befunde.reduce((s, b) => s + b.maximum, 0)).toBe(WETT_PUNKTE)
  })
})
