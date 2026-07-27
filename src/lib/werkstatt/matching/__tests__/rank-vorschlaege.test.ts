import { describe, it, expect } from 'vitest'
import { rankeWerkstattVorschlaege, istBelastbareBewertung, type WerkstattKandidat, type MatchingKontext } from '../rank-vorschlaege'

// Aaron 14.07.: "ich möchte einen Vorschlag von bis zu fünf Werkstätten — im FlowLink auswählbar, mit
// wirklichem Grund warum das passt. Also BMW markengebunden schlägt freie Werkstatt, und natürlich
// auch welcher Schaden passend ist, ob die das reparieren kann, und die Fahrzeugklasse. Das sind die
// Kriterien, auf denen basierend die Vorschläge gerankt werden müssen."
// + "Fahrzeugstandort spielt logischerweise auch eine Rolle, also Entfernung."
//
// REVISION Aaron 27.07. (D1+D4, Spec 2026-07-27-werkstatt-finder-followups):
// "Es koennen nur Werkstaetten in der Naehe gezeigt werden; Distanz muss immer schlagen."
// -> harter Umkreis (MAX_UMKREIS_KM) + Distanz primaer (ganze km); Marke/Gewerke/Gruppe/
// verifiziert nur noch Tiebreaker in derselben km-Klasse. Und: Vertragswerkstatt-Rang NUR
// verifiziert (lange Marken-Listen duerfen den Bonus nicht vervielfachen).

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
  it('AARONS KERN-REGEL (gleiche km-Klasse): markengebunden schlaegt freie Werkstatt', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'frei', ist_freie_werkstatt: true }),
        werkstatt({ id: 'bmw', marken: ['BMW', 'MINI'], verifiziert: true }),
      ],
      KONTEXT,
    )
    expect(r[0].id).toBe('bmw')
    expect(r[0].markenMatch).toBe('marke')
    expect(r[1].markenMatch).toBe('frei')
  })

  it('D1-REVISION (Aaron 27.07.): Distanz schlaegt Marke — die naehere freie gewinnt', () => {
    const r = rankeWerkstattVorschlaege(
      [
        // ~20 km weg (im Umkreis), verifizierte BMW-Vertragswerkstatt
        werkstatt({ id: 'bmw-20km', marken: ['BMW'], verifiziert: true, lat: 51.117, lng: 6.9603 }),
        // direkt um die Ecke, aber markenoffen
        werkstatt({ id: 'frei-nah', ist_freie_werkstatt: true }),
      ],
      KONTEXT,
    )
    expect(r.map((x) => x.id)).toEqual(['frei-nah', 'bmw-20km'])
  })

  it('Marken-Vergleich ist case-insensitiv (OCR/Stammdaten liefern gemischt)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'a', marken: ['bmw'], verifiziert: true })],
      KONTEXT,
    )
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
    // Ohne Anker (D1-Cap greift nur mit Anker) — mit Anker waere ohne-Geo unsichtbar (s.u.).
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null, ist_freie_werkstatt: true })],
      { ...KONTEXT, anker: null },
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

describe('istBelastbareBewertung', () => {
  it('true nur bei >= 4,0 UND >= 5 Bewertungen (sonst kein Badge/Chip)', () => {
    expect(istBelastbareBewertung(4.0, 5)).toBe(true)
    expect(istBelastbareBewertung(4.8, 112)).toBe(true)
    expect(istBelastbareBewertung(3.9, 100)).toBe(false) // Rating zu niedrig
    expect(istBelastbareBewertung(4.9, 4)).toBe(false) // zu wenige Bewertungen
    expect(istBelastbareBewertung(null, 10)).toBe(false)
    expect(istBelastbareBewertung(4.5, null)).toBe(false)
    expect(istBelastbareBewertung(undefined, undefined)).toBe(false)
  })
})

// D1 (Aaron 27.07.): "Es koennen nur Werkstaetten in der Naehe gezeigt werden; Distanz
// muss immer schlagen." Harter Anzeige-Umkreis + Distanz als primaeres Sortierkriterium.
describe('D1: Umkreis-Filter + Distanz primaer', () => {
  it('jenseits MAX_UMKREIS_KM unsichtbar — auch verifiziert (kein Fern-Fallback mehr)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'fern-verifiziert', verifiziert: true, lat: 53.54, lng: 8.58 }), // ~300 km
        werkstatt({ id: 'nah' }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['nah'])
  })

  it('ohne Geo bei vorhandenem Anker unsichtbar (Naehe nicht belegbar)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null }), werkstatt({ id: 'mit-geo' })],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['mit-geo'])
  })

  it('ohne Anker bleibt alles sichtbar (kein Distanz-Wissen = kein Ausschluss)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'ohne-geo', lat: null, lng: null }), werkstatt({ id: 'mit-geo' })],
      { ...KONTEXT, anker: null },
    )
    expect(r).toHaveLength(2)
  })

  it('maxUmkreisKm=null hebt den Cap (interne Tools)', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'fern', lat: 53.54, lng: 8.58 })],
      { ...KONTEXT, maxUmkreisKm: null },
    )
    expect(r.map((v) => v.id)).toEqual(['fern'])
  })

  it('Distanz schlaegt verifiziert: 2-km-unverifiziert vor 4-km-verifiziert', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'verifiziert-4km', verifiziert: true, lat: KOELN.lat + 0.036, lng: KOELN.lng }),
        werkstatt({ id: 'unverifiziert-2km', lat: KOELN.lat + 0.018, lng: KOELN.lng }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['unverifiziert-2km', 'verifiziert-4km'])
  })

  it('gleiche km-Klasse: verifiziert gewinnt (Tiebreak-Kaskade lebt)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'unverif', lat: KOELN.lat + 0.001, lng: KOELN.lng }),
        werkstatt({ id: 'verif', verifiziert: true, lat: KOELN.lat + 0.002, lng: KOELN.lng }),
      ],
      KONTEXT,
    )
    expect(r.map((v) => v.id)).toEqual(['verif', 'unverif'])
  })

  it('Eignungs-Fallback bleibt im Umkreis (liefert nie Ferne nach)', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'nah-passt-nicht', faehigkeiten: ['glas'] }),
        werkstatt({ id: 'fern-passt', faehigkeiten: ['karosserie'], lat: 53.54, lng: 8.58 }),
      ],
      { ...KONTEXT, bedarf: ['karosserie'], bedarfConfidence: 80 },
    )
    expect(r.map((v) => v.id)).toEqual(['nah-passt-nicht'])
  })
})

// D4 (Aaron 27.07.): "wenn er mehrere Marken angibt und dadurch besser rankt ist das falsch."
// Vertragswerkstatt-Rang nur beglaubigt (Verifizierungs-Gate).
describe('D4: Marken-Rang nur verifiziert (Verifizierungs-Gate)', () => {
  it('verifiziert + Treffer -> marke + Vertragswerkstatt-Chip', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['BMW'], verifiziert: true })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('marke')
    expect(r[0].gruende.map((g) => g.text)).toContain('BMW-Vertragswerkstatt')
  })

  it('unverifiziert + Treffer -> frei-Rang, Chip "Repariert BMW", KEIN Vertrags-/Frei-Chip', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['BMW'], verifiziert: false, ist_freie_werkstatt: false })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('frei')
    const texte = r[0].gruende.map((g) => g.text)
    expect(texte).toContain('Repariert BMW')
    expect(texte).not.toContain('BMW-Vertragswerkstatt')
    expect(texte).not.toContain('Freie Werkstatt (alle Marken)')
  })

  it('lange Marken-Liste unverifiziert bringt keinen Bonus gegenueber markenoffen', () => {
    const r = rankeWerkstattVorschlaege(
      [
        werkstatt({ id: 'gamer', marken: ['BMW', 'Audi', 'VW', 'Opel', 'Ford'], lat: KOELN.lat + 0.002, lng: KOELN.lng }),
        werkstatt({ id: 'offen', ist_freie_werkstatt: true, lat: KOELN.lat + 0.001, lng: KOELN.lng }),
      ],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('frei')
    expect(r[1].markenMatch).toBe('frei')
  })

  it('Spezialist-Guard unveraendert: gepflegte Marken ohne Treffer bleiben unbekannt', () => {
    const r = rankeWerkstattVorschlaege(
      [werkstatt({ id: 'w', marken: ['Audi'], verifiziert: true, ist_freie_werkstatt: false })],
      { ...KONTEXT, marke: 'BMW' },
    )
    expect(r[0].markenMatch).toBe('unbekannt')
  })
})
