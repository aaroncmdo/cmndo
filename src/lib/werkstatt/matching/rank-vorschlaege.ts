// Werkstatt-Matching-Engine (Spec B, Aaron 14.07.).
//
// Aaron: "Ich möchte einen Vorschlag von bis zu fünf Werkstätten — im FlowLink auswählbar, mit
// wirklichem Grund warum das passt. BMW markengebunden schlägt freie Werkstatt, und natürlich auch
// welcher Schaden passend ist, ob die das reparieren kann, und die Fahrzeugklasse. Das sind die
// Kriterien, auf denen basierend die Vorschläge gerankt werden müssen."
// + "Fahrzeugstandort spielt logischerweise auch eine Rolle, also Entfernung."
//
// Pure + client-safe (nur haversineKm) -> vitest-getestet. KEIN Auto-Assign: der Kunde waehlt.
//
// Von den drei Achsen existierte bisher nur EINE: Gewerke (schadenskategorie/faehigkeiten, inkl. der
// produktiven KI-Schadenbild-Klassifikation). Marke und Fahrzeugklasse kamen mit Spec B dazu — beide
// DETERMINISTISCH (Marke + EU-Klasse stehen im Fahrzeugschein), kein KI-Mapping noetig.

import { haversineKm } from '@/lib/gps/geofence'

/** Ab dieser Bedarfs-Confidence wird hart gefiltert (bestehendes Gate aus bedarf/qualifiziere.ts). */
export const HART_SCHWELLE = 60

const STATUS_AKTIV = 'aktiv'
const MAX_VORSCHLAEGE = 5

/**
 * „Belastbare" Google-Bewertung = echtes Vertrauens-Signal: >= 4,0 Sterne UND >= 5 Bewertungen.
 * Ein 3-Sterne- oder 2-Reviews-Profil ist kein Trust-Argument. Single Source of Truth fuer den
 * GBP-Trust-Chip (baueGruende) UND den Google-Badge in Card/Popup/Sheet (WerkstattFinder /
 * WerkstattProfileInhalt) — sonst zeigt der Badge auch „★ 2,5" (Aaron 23.07.).
 */
export function istBelastbareBewertung(
  rating: number | null | undefined,
  anzahl: number | null | undefined,
): boolean {
  return rating != null && anzahl != null && rating >= 4 && anzahl >= 5
}

export type Fit = 'passt' | 'passt_nicht' | 'unbekannt'
export type MarkenMatch = 'marke' | 'frei' | 'unbekannt'
// 'trust' = Chips, die die Finder-Karte SEPARAT rendert (aktuell nur "Verifizierter Partner",
// als Badge neben dem Namen) und darum aus der Chip-Zeile filtert. 'rating' ist bewusst ein
// EIGENER Typ: der GBP-★-Chip hat keine separate Render-Stelle und muss in der Chip-Zeile
// landen — als 'trust' wurde er von WerkstattFinder.tsx still verschluckt (Prod-Smoke 19.07.).
export type MatchGrundTyp = 'marke' | 'gewerk' | 'klasse' | 'distanz' | 'trust' | 'rating'

/** Ein sichtbarer Grund, warum diese Werkstatt vorgeschlagen wird (die UI rendert sie als Chips). */
export type MatchGrund = { typ: MatchGrundTyp; text: string }

export type WerkstattKandidat = {
  id: string
  name: string
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  telefon: string | null
  lat: number | null
  lng: number | null
  status: string
  faehigkeiten: string[] | null
  verifiziert: boolean | null
  // Spec B: die zwei neuen Achsen
  marken: string[] | null
  ist_freie_werkstatt: boolean | null
  fahrzeug_gruppen: string[] | null
  // #18 Datenpflege (Spec §5/§6): GBP-Trust — gecachte Google-Bewertung (scripts/werkstatt-gbp-pull.mjs).
  // Optional, damit bestehende Kandidat-Konstruktionen (Tests/Alt-Caller) unveraendert kompilieren.
  google_rating?: number | null
  google_review_count?: number | null
}

export type WerkstattVorschlag = Omit<WerkstattKandidat, 'verifiziert'> & {
  /** Normalisiert (null -> false), damit der Vorschlag ein Superset der alten WerkstattFinderRow ist. */
  verifiziert: boolean
  distanz_km: number
  markenMatch: MarkenMatch
  gewerkeFit: Fit
  gruppenFit: Fit
  gruende: MatchGrund[]
  /**
   * Backward-compat fuer die bestehende WerkstattFinder-UI (sie prueft auf `passt`). So laeuft sie
   * unveraendert weiter, waehrend die neuen Felder (gruende/markenMatch/...) fuer die Chips
   * bereitstehen — kein Big-Bang-Umbau der UI noetig.
   */
  passt: boolean
}

export type MatchingKontext = {
  /** Reparatur-Gruppe des Fahrzeugs (fahrzeugklassen.reparatur_gruppe, abgeleitet aus Feld J). */
  fahrzeugGruppe: string | null
  /** Automarke (vehicles.hersteller / leads.fahrzeug_hersteller, ZB1 Feld D.1). */
  marke: string | null
  /** Gewerke-Bedarf (bedarf_kategorien): karosserie | lackierung | mechanik | glas | smart_repair. */
  bedarf: string[]
  /** 0-100 (bedarf_confidence). Ab HART_SCHWELLE wird hart gefiltert. */
  bedarfConfidence: number
  /** Geo-Anker = FAHRZEUGSTANDORT (wo das Auto steht) — NICHT der Besichtigungsort. */
  anker: { lat: number; lng: number } | null
}

const GEWERK_LABEL: Record<string, string> = {
  karosserie: 'Karosserie',
  lackierung: 'Lackierung',
  mechanik: 'Mechanik',
  glas: 'Glas',
  smart_repair: 'Smart Repair',
}

const GRUPPE_LABEL: Record<string, string> = {
  pkw: 'PKW',
  transporter: 'Transporter',
  lkw: 'LKW',
  bus: 'Busse',
  motorrad: 'Motorräder',
  leichtfahrzeug: 'Leichtfahrzeuge',
  anhaenger: 'Anhänger',
  land_forst: 'Land-/Forstfahrzeuge',
}

// Sortier-Raenge: kleiner = besser.
const MARKEN_RANG: Record<MarkenMatch, number> = { marke: 0, frei: 1, unbekannt: 2 }
const FIT_RANG: Record<Fit, number> = { passt: 0, unbekannt: 1, passt_nicht: 2 }

/**
 * Führt die Werkstatt die Marke? Sonst: ist sie markenoffen? (Marke schlägt frei — Aarons Regel.)
 *
 * Aaron 21.07.: KEINE gepflegten Marken = freie Werkstatt (alle Marken). Ohne diese Ableitung ist
 * eine aktive Partnerwerkstatt ohne Marken-Pflege im Matching unsichtbar — 'unbekannt' rankt hinter
 * JEDER 'frei'-Werkstatt, das Limit schneidet sie ab (Prod-Smoke 20.07.: 0,01 km entfernt, trotzdem
 * nicht gelistet, 12 Betriebe aus 400+ km davor). Das explizite ist_freie_werkstatt-Flag bleibt als
 * Override, ist aber nicht mehr Pflicht. Eine Werkstatt MIT Marken-Pflege, die die gesuchte Marke
 * nicht führt, bleibt bewusst Spezialist -> 'unbekannt' (sonst würde die Regel jeden Spezialisten
 * fälschlich zum Allrounder machen).
 */
function bewerteMarke(w: WerkstattKandidat, marke: string | null): MarkenMatch {
  const gesucht = marke?.trim().toUpperCase()
  if (gesucht && w.marken?.some((m) => m.trim().toUpperCase() === gesucht)) return 'marke'
  const hatMarken = (w.marken?.length ?? 0) > 0
  if (w.ist_freie_werkstatt === true || !hatMarken) return 'frei'
  return 'unbekannt'
}

/**
 * Gewerke: der Bedarf muss VOLLSTAENDIG abgedeckt sein (bedarf ⊆ faehigkeiten).
 * Leere Fähigkeiten = 'unbekannt', NICHT "kann alles" — sonst gewinnt eine ungepflegte Werkstatt
 * gegen eine, die ihre Gewerke sauber gepflegt hat.
 */
function bewerteGewerke(faehigkeiten: string[] | null, bedarf: string[]): Fit {
  if (bedarf.length === 0) return 'unbekannt'
  if (!faehigkeiten || faehigkeiten.length === 0) return 'unbekannt'
  return bedarf.every((b) => faehigkeiten.includes(b)) ? 'passt' : 'passt_nicht'
}

/**
 * Fahrzeug-Gruppe: kann die Werkstatt das Fahrzeug überhaupt? (Eine PKW-Werkstatt repariert keinen LKW.)
 * Ungepflegt (leer) = 'unbekannt' -> nicht ausschließen, aber schlechter ranken.
 */
function bewerteGruppe(gruppen: string[] | null, gruppe: string | null): Fit {
  if (!gruppe) return 'unbekannt' // Fahrzeugklasse unbekannt -> darf niemanden ausschließen
  if (!gruppen || gruppen.length === 0) return 'unbekannt'
  return gruppen.includes(gruppe) ? 'passt' : 'passt_nicht'
}

function baueGruende(
  w: WerkstattKandidat,
  k: MatchingKontext,
  markenMatch: MarkenMatch,
  gewerkeFit: Fit,
  gruppenFit: Fit,
  distanzKm: number,
): MatchGrund[] {
  const gruende: MatchGrund[] = []

  if (markenMatch === 'marke' && k.marke) {
    gruende.push({ typ: 'marke', text: `${k.marke.trim()}-Vertragswerkstatt` })
  } else if (markenMatch === 'frei') {
    gruende.push({ typ: 'marke', text: 'Freie Werkstatt (alle Marken)' })
  }

  if (gewerkeFit === 'passt' && k.bedarf.length > 0) {
    const labels = k.bedarf.map((b) => GEWERK_LABEL[b] ?? b)
    gruende.push({ typ: 'gewerk', text: `Repariert ${labels.join(' + ')}` })
  }

  if (gruppenFit === 'passt' && k.fahrzeugGruppe) {
    const label = GRUPPE_LABEL[k.fahrzeugGruppe] ?? k.fahrzeugGruppe
    gruende.push({ typ: 'klasse', text: `Kann ${label}` })
  }

  // Ohne Koordinaten kein Distanz-Chip — "Infinity km" wäre schlechter als gar keine Angabe.
  if (Number.isFinite(distanzKm)) {
    gruende.push({
      typ: 'distanz',
      text: `${distanzKm.toFixed(1).replace('.', ',')} km vom Fahrzeugstandort`,
    })
  }

  if (w.verifiziert === true) {
    gruende.push({ typ: 'trust', text: 'Verifizierter Partner' })
  }

  // GBP-Trust-Chip (Spec §5): nur bei belastbarem Rating (>= 4,0 UND >= 5 Bewertungen) —
  // ein 3-Sterne-Profil ist kein Vertrauens-Argument. Reine ANZEIGE, kein Ranking-Einfluss
  // (Sortierung bleibt Marke→Gewerke→Gruppe→verifiziert→Distanz; Umbau = Produktentscheidung).
  const rating = w.google_rating ?? null
  const anzahl = w.google_review_count ?? 0
  if (rating !== null && istBelastbareBewertung(rating, anzahl)) {
    gruende.push({
      // typ 'rating', NICHT 'trust' — s. MatchGrundTyp. Als 'trust' filtert die Finder-Karte
      // den Chip weg (dort ist 'trust' = "wird separat gerendert"), und er kam nie beim Kunden an.
      typ: 'rating',
      text: `★ ${rating.toFixed(1).replace('.', ',')} bei Google (${anzahl} Bewertungen)`,
    })
  }

  return gruende
}

function bewerte(w: WerkstattKandidat, k: MatchingKontext): WerkstattVorschlag {
  const distanz_km =
    k.anker && w.lat !== null && w.lng !== null
      ? haversineKm(k.anker.lat, k.anker.lng, w.lat, w.lng)
      : Infinity

  const markenMatch = bewerteMarke(w, k.marke)
  const gewerkeFit = bewerteGewerke(w.faehigkeiten, k.bedarf)
  const gruppenFit = bewerteGruppe(w.fahrzeug_gruppen, k.fahrzeugGruppe)

  return {
    ...w,
    verifiziert: w.verifiziert === true,
    distanz_km,
    markenMatch,
    gewerkeFit,
    gruppenFit,
    // 'passt' = der Gewerke-Fit (so hat die alte UI es interpretiert). 'unbekannt' zaehlt bewusst
    // NICHT als passt — sonst wirkt eine ungepflegte Werkstatt so sicher wie eine geprüfte.
    passt: gewerkeFit === 'passt',
    gruende: baueGruende(w, k, markenMatch, gewerkeFit, gruppenFit, distanz_km),
  }
}

/** Aarons Reihenfolge: Marke > Gewerke-Fit > Fahrzeug-Gruppe > verifiziert > Entfernung. */
function vergleiche(a: WerkstattVorschlag, b: WerkstattVorschlag): number {
  const marke = MARKEN_RANG[a.markenMatch] - MARKEN_RANG[b.markenMatch]
  if (marke !== 0) return marke

  const gewerk = FIT_RANG[a.gewerkeFit] - FIT_RANG[b.gewerkeFit]
  if (gewerk !== 0) return gewerk

  const gruppe = FIT_RANG[a.gruppenFit] - FIT_RANG[b.gruppenFit]
  if (gruppe !== 0) return gruppe

  const trust = Number(b.verifiziert === true) - Number(a.verifiziert === true)
  if (trust !== 0) return trust

  return a.distanz_km - b.distanz_km
}

/**
 * Die bis zu 5 passendsten Werkstätten — gerankt, jede mit sichtbaren Gründen.
 *
 * HARTE FILTER (fliegt raus):
 *   • Fahrzeug-Gruppe gepflegt UND passt nicht (PKW-Werkstatt ≠ LKW)
 *   • Gewerke passen nicht — aber nur ab bedarfConfidence >= HART_SCHWELLE; darunter wissen wir den
 *     Bedarf nicht sicher genug, um jemanden auszuschließen.
 *
 * FALLBACK: filtern die Kriterien ALLES weg, liefern wir lieber die Geo-nächsten als eine leere Liste
 * (der Kunde soll immer etwas wählen können — er sieht ja die Gründe und kann selbst entscheiden).
 */
export function rankeWerkstattVorschlaege(
  kandidaten: WerkstattKandidat[],
  kontext: MatchingKontext,
  limit: number = MAX_VORSCHLAEGE,
): WerkstattVorschlag[] {
  const bewertet = kandidaten
    .filter((w) => w.status === STATUS_AKTIV)
    .map((w) => bewerte(w, kontext))

  const gefiltert = bewertet.filter((v) => {
    if (v.gruppenFit === 'passt_nicht') return false
    if (kontext.bedarfConfidence >= HART_SCHWELLE && v.gewerkeFit === 'passt_nicht') return false
    return true
  })

  const basis = gefiltert.length > 0 ? gefiltert : bewertet
  return [...basis].sort(vergleiche).slice(0, limit)
}
