import { describe, it, expect } from 'vitest'
import { rankeWerkstattVorschlaege, type WerkstattKandidat, type MatchingKontext } from '../rank-vorschlaege'

// Aaron 14.07.: "ich möchte einen Vorschlag von bis zu fünf Werkstätten — im FlowLink auswählbar, mit
// wirklichem Grund warum das passt. Also BMW markengebunden schlägt freie Werkstatt, und natürlich
// auch welcher Schaden passend ist, ob die das reparieren kann, und die Fahrzeugklasse. Das sind die
// Kriterien, auf denen basierend die Vorschläge gerankt werden müssen."
// + "Fahrzeugstandort spielt logischerweise auch eine Rolle, also Entfernung."

const KOELN = { lat: 50.9375, lng: 6.9603 }

function werkstatt(over: Partial<WerkstattKandidat> & { id: string }): WerkstattKandidat {
  return {
    name: `Werkstatt ${over.id}`,
    adresse_strasse: null,
    adresse_plz: null,
    adresse_ort: null,
    telefon: null,
    lat: KOELN.lat,
    lng: KOELN.lng,
    status: 'aktiv',
    faehigkeiten: ['karosserie', 'lackierung'],
    verifiziert: false,
    marken: null,
    ist_freie_werkstatt: null,
    fahrzeug_gruppen: ['pkw'],
    ...over,
  }
}

const KONTEXT: MatchingKontext = {
  fahrzeugGruppe: 'pkw',
  marke: 'BMW',
  bedarf: ['karosserie', 'lackierung'],
  bedarfConfidence: 100,
  anker: KOELN,
}

describe('rankeWerkstattVorschlaege — Ranking', () => {
  it('AARONS KERN-REGEL: markengebunden schlaegt freie Werkstatt', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'frei', ist_freie_werkstatt: true }),
        werkstatt({ id: 'bmw', marken: ['BMW', 'MINI'] }),
      ],
      KONTEXT,
    )
    expect(r[0].id).toBe('bmw')
    expect(r[0].markenMatch).toBe('marke')
    expect(r[1].markenMatch).toBe('frei')
  })

  it('Marken-Match schlaegt sogar die naehere Werkstatt (Marke ist das staerkste Kriterium)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        // 50 km weg, aber BMW-Vertragswerkstatt
        werkstatt({ id: 'bmw-fern', marken: ['BMW'], lat: 51.4, lng: 6.9 }),
        // direkt um die Ecke, aber markenoffen
        werkstatt({ id: 'frei-nah', ist_freie_werkstatt: true }),
      ],
      KONTEXT,
    )
    expect(r[0].id).toBe('bmw-fern')
  })

  it('Marken-Vergleich ist case-insensitiv (OCR/Stammdaten liefern gemischt)', () => {
    const r = rankeWerkstattVorschlaege([werkstatt({ id: 'a', marken: ['bmw'] })], KONTEXT)
    expect(r[0].markenMatch).toBe('marke')
  })

  it('bei gleichem Marken-Rang entscheidet der Gewerke-Fit, dann verifiziert, dann Distanz', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'weit', ist_freie_werkstatt: true, verifiziert: true, lat: 51.2, lng: 6.9 }),
        werkstatt({ id: 'nah', ist_freie_werkstatt: true, verifiziert: true }),
      ],
      KONTEXT,
    )
    expect(r.map((x) => x.id)).toEqual(['nah', 'weit'])
  })

  it('verifiziert schlaegt unverifiziert (bei sonst gleichem Rang)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'unverifiziert', ist_freie_werkstatt: true, verifiziert: false }),
        werkstatt({ id: 'verifiziert', ist_freie_werkstatt: true, verifiziert: true }),
      ],
      KONTEXT,
    )
    expect(r[0].id).toBe('verifiziert')
  })

  it('liefert maximal 5 Vorschlaege', () => {
    const viele = Array.from({ length: 9 }, (_, i) => werkstatt({ id: `w${i}`, ist_freie_werkstatt: true }))
    expect(rankeWerkstattVorschlaege(viele, KONTEXT)).toHaveLength(5)
  })
})

// Aaron 21.07.: "im Grunde ist es doch genug, wenn wir keine Marken haben, dass es eine freie
// Werkstatt ist." Prod-Smoke 20.07.: eine aktive+verifizierte Partnerwerkstatt mit marken=null UND
// ist_freie_werkstatt=null war im Matching UNSICHTBAR — 'unbekannt' rankt hinter JEDER 'frei'-
// Werkstatt, das Limit schnitt sie ab (0,01 km entfernt, trotzdem nicht gelistet; 12 Betriebe aus
// 400+ km standen davor). Keine gepflegten Marken = freie Werkstatt (alle Marken).
describe('keine Marken = freie Werkstatt (Aaron 21.07.)', () => {
  it('ohne gepflegte Marken zaehlt eine Werkstatt als frei (nicht unbekannt)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-marken', marken: null, ist_freie_werkstatt: null })],
      KONTEXT,
    )
    expect(r[0].markenMatch).toBe('frei')
    expect(r[0].gruende.map((g) => g.text)).toContain('Freie Werkstatt (alle Marken)')
  })

  it('leeres Marken-Array zaehlt ebenfalls als frei (auch bei ist_freie_werkstatt=false)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'leer', marken: [], ist_freie_werkstatt: false })],
      KONTEXT,
    )
    expect(r[0].markenMatch).toBe('frei')
  })

  it('die markenlose Werkstatt schlaegt eine, die eine ANDERE Marke fuehrt (unbekannt)', () => {
    // gesucht = BMW; der Mercedes-Spezialist fuehrt BMW nicht -> 'unbekannt' (Rang 2), die
    // markenlose ist 'frei' (Rang 1) und rankt davor. Vorher war die markenlose SELBST 'unbekannt'
    // und verschwand hinter jeder frei-Werkstatt — genau der Unsichtbar-Bug.
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'mercedes-spezi', marken: ['Mercedes'] }),
        werkstatt({ id: 'markenlos', marken: null }),
      ],
      KONTEXT,
    )
    expect(r[0].id).toBe('markenlos')
    expect(r[0].markenMatch).toBe('frei')
    expect(r.find((x) => x.id === 'mercedes-spezi')?.markenMatch).toBe('unbekannt')
  })

  it('GUARD: eine gepflegte Marken-Werkstatt bleibt Spezialist — fuehrt sie die gesuchte Marke NICHT, ist sie NICHT frei', () => {
    // Audi-Werkstatt bei BMW-Suche: sie hat eine Marken-Pflege (nur nicht BMW) -> 'unbekannt',
    // NICHT 'frei'. Sonst wuerde die Regel jeden Spezialisten faelschlich zum Allrounder machen.
    const r = rankeWerkstattVorschlaege([werkstatt({ id: 'audi-only', marken: ['Audi'] })], KONTEXT)
    expect(r[0].markenMatch).toBe('unbekannt')
  })
})

describe('rankeWerkstattVorschlaege — harte Filter', () => {
  it('FAHRZEUGKLASSE: eine PKW-Werkstatt taucht bei einem LKW NICHT auf', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'pkw-only', fahrzeug_gruppen: ['pkw'] }),
        werkstatt({ id: 'lkw-faehig', fahrzeug_gruppen: ['lkw', 'transporter'] }),
      ],
      { ...KONTEXT, fahrzeugGruppe: 'lkw' },
    )
    expect(r.map((x) => x.id)).toEqual(['lkw-faehig'])
  })

  it('GEWERKE: wer den Schaden nicht reparieren kann, faellt raus (ab Confidence 60)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'nur-glas', faehigkeiten: ['glas'] }),
        werkstatt({ id: 'karo-lack', faehigkeiten: ['karosserie', 'lackierung'] }),
      ],
      { ...KONTEXT, bedarf: ['karosserie', 'lackierung'], bedarfConfidence: 80 },
    )
    expect(r.map((x) => x.id)).toEqual(['karo-lack'])
  })

  // Unter der Schwelle wissen wir den Bedarf nicht sicher genug (bestehendes Confidence-Gate).
  it('GEWERKE: unter Confidence 60 wird NICHT hart gefiltert (nur schlechter gerankt)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'nur-glas', faehigkeiten: ['glas'] }),
        werkstatt({ id: 'karo-lack', faehigkeiten: ['karosserie', 'lackierung'] }),
      ],
      { ...KONTEXT, bedarf: ['karosserie', 'lackierung'], bedarfConfidence: 40 },
    )
    expect(r).toHaveLength(2)
    expect(r[0].id).toBe('karo-lack') // der Passende rankt trotzdem vorn
  })

  it('ungepflegte Werkstatt (keine fahrzeug_gruppen) wird NICHT ausgeschlossen, aber schlechter gerankt', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'ungepflegt', fahrzeug_gruppen: null, ist_freie_werkstatt: true }),
        werkstatt({ id: 'gepflegt', fahrzeug_gruppen: ['pkw'], ist_freie_werkstatt: true }),
      ],
      KONTEXT,
    )
    expect(r).toHaveLength(2)
    expect(r[0].id).toBe('gepflegt')
    expect(r[1].gruppenFit).toBe('unbekannt')
  })

  it('inaktive Werkstaetten sind nie dabei', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'gesperrt', status: 'gesperrt' }), werkstatt({ id: 'aktiv' })],
      KONTEXT,
    )
    expect(r.map((x) => x.id)).toEqual(['aktiv'])
  })

  // Lieber die Geo-naechsten zeigen als eine leere Liste (das bestehende Fallback-Verhalten).
  it('FALLBACK: filtern alle Kriterien alles weg -> trotzdem Vorschlaege (nach Distanz)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'pkw-only', fahrzeug_gruppen: ['pkw'], faehigkeiten: ['glas'] })],
      { ...KONTEXT, fahrzeugGruppe: 'lkw', bedarfConfidence: 100 },
    )
    expect(r).toHaveLength(1)
    expect(r[0].id).toBe('pkw-only')
  })

  it('unbekannte Fahrzeugklasse -> Gruppe filtert nicht (wir wissen es nicht)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'a', fahrzeug_gruppen: ['lkw'] })],
      { ...KONTEXT, fahrzeugGruppe: null },
    )
    expect(r).toHaveLength(1)
    expect(r[0].gruppenFit).toBe('unbekannt')
  })
})

describe('rankeWerkstattVorschlaege — Begruendungen (Aaron: "mit wirklichem Grund warum das passt")', () => {
  it('liefert Marke, Gewerk, Klasse, Distanz und Trust als Chips', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'bmw', marken: ['BMW'], verifiziert: true, lat: 50.95, lng: 6.97 })],
      KONTEXT,
    )
    const typen = r[0].gruende.map((g) => g.typ)
    expect(typen).toContain('marke')
    expect(typen).toContain('gewerk')
    expect(typen).toContain('klasse')
    expect(typen).toContain('distanz')
    expect(typen).toContain('trust')

    const texte = r[0].gruende.map((g) => g.text)
    expect(texte).toContain('BMW-Vertragswerkstatt')
    expect(texte).toContain('Repariert Karosserie + Lackierung')
    expect(texte).toContain('Kann PKW')
    expect(texte.some((t) => t.includes('vom Fahrzeugstandort'))).toBe(true)
  })

  it('freie Werkstatt bekommt den passenden Grund (nicht "BMW-Vertragswerkstatt")', () => {
    const r = rankeWerkstattVorschlaege([werkstatt({ id: 'frei', ist_freie_werkstatt: true })], KONTEXT)
    const texte = r[0].gruende.map((g) => g.text)
    expect(texte).toContain('Freie Werkstatt (alle Marken)')
    expect(texte).not.toContain('BMW-Vertragswerkstatt')
  })

  it('ohne Koordinaten kein Distanz-Chip (statt "Infinity km")', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null, ist_freie_werkstatt: true })],
      KONTEXT,
    )
    expect(r[0].gruende.some((g) => g.typ === 'distanz')).toBe(false)
    expect(r[0].distanz_km).toBe(Infinity)
  })
})

describe('GBP-Trust-Chip (Spec §5 — reine Anzeige, kein Ranking-Einfluss)', () => {
  const ratingChips = (k: WerkstattKandidat) =>
    rankeWerkstattVorschlaege([k], KONTEXT)[0].gruende.filter((g) => g.typ === 'rating')

  /**
   * Spiegelt den Chip-Filter der Finder-Karte (`WerkstattFinder.tsx`): dort werden
   * 'distanz' und 'trust' bewusst ausgeblendet, weil beide schon anderswo in der Card
   * stehen (Distanz-Zeile unten, "✓ Verifizierter Partner" neben dem Namen).
   * Der GBP-Chip hat KEINE separate Render-Stelle — er MUSS diesen Filter ueberleben.
   */
  const sichtbareChips = (k: WerkstattKandidat) =>
    rankeWerkstattVorschlaege([k], KONTEXT)[0].gruende.filter(
      (g) => g.typ !== 'distanz' && g.typ !== 'trust',
    )

  it('rendert ★-Chip ab 4,0 und >= 5 Bewertungen (deutsches Zahlenformat)', () => {
    const chips = ratingChips(werkstatt({ id: 'gbp', google_rating: 4.8, google_review_count: 130 }))
    expect(chips.map((c) => c.text)).toContain('★ 4,8 bei Google (130 Bewertungen)')
  })

  it('kein Chip unter 4,0 Rating', () => {
    expect(ratingChips(werkstatt({ id: 'low', google_rating: 3.9, google_review_count: 50 }))).toHaveLength(0)
  })

  it('kein Chip unter 5 Bewertungen (nicht belastbar)', () => {
    expect(ratingChips(werkstatt({ id: 'few', google_rating: 5, google_review_count: 3 }))).toHaveLength(0)
  })

  it('ohne GBP-Daten kein Chip; verifiziert-Chip bleibt unabhaengig bestehen', () => {
    expect(ratingChips(werkstatt({ id: 'ohne' }))).toHaveLength(0)
    const w = werkstatt({ id: 'beide', verifiziert: true, google_rating: 4.6, google_review_count: 9 })
    const alle = rankeWerkstattVorschlaege([w], KONTEXT)[0].gruende
    expect(alle.filter((g) => g.typ === 'trust').map((c) => c.text)).toEqual(['Verifizierter Partner'])
    expect(alle.filter((g) => g.typ === 'rating').map((c) => c.text)).toEqual([
      '★ 4,6 bei Google (9 Bewertungen)',
    ])
  })

  it('REGRESSION: der GBP-Chip ueberlebt den Chip-Filter der Finder-Karte', () => {
    // Prod-Smoke 19.07. (#4453): 4 von 5 Treffern im Werkstatt-Embed waren chip-faehig
    // (Picarsso 5,0/202 · Schaefer 4,9/81 · Lackprofi 4,6/51 · Suelzer 4,6/9) — sichtbar
    // war KEINER. Ursache: der Chip wurde als typ 'trust' eingehaengt, genau die Kategorie,
    // die die Karte ausblendet. Eigener typ 'rating' = der Chip kommt beim Kunden an.
    const sichtbar = sichtbareChips(
      werkstatt({ id: 'sichtbar', google_rating: 4.9, google_review_count: 81 }),
    )
    expect(sichtbar.map((c) => c.text)).toContain('★ 4,9 bei Google (81 Bewertungen)')
  })
})
