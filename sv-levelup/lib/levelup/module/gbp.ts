import { PlacesFehler, type Betrieb, type Profil } from '../../places'
import { kernName } from '../../anreicherung/kern-name'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`gbp: 22`). */
export const GBP_PUNKTE = 22
export const UMKREIS_KM = 25
export const SUCHBEGRIFF = 'Kfz-Sachverständiger'

/**
 * Punktverteilung — BESCHLUSS (die Messvorschrift `references/scoring-modell.md`
 * ist nicht auffindbar, wie bei `web` und `wett`).
 *
 * ⭐ Gewichtet nach der am 19.08. an 91 echten Betrieben (Muenster + Dortmund)
 * GEMESSENEN Streuung — nicht nach Gefuehl:
 *
 *   Bewertungszahl    3 bis 95        → trennt stark  → 7 Punkte
 *   Fotos             0 bis 10        → trennt gut    → 6 Punkte
 *   Oeffnungszeiten   einer von acht ohne             → 5 Punkte
 *   Bewertungsschnitt 92 % ueber 4,5, 60 % glatt 5,0  → trennt kaum → 2 Punkte
 *   Telefon/Website   hatten ALLE acht                → je 1 Punkt
 *
 * Was nicht unterscheidet, darf nicht schwer wiegen — sonst misst der Befund
 * die Branche und nennt es die Leistung des Betriebs.
 */
export const GEWICHTE = {
  fotos: 6,
  oeffnungszeiten: 5,
  bewertungszahl: 7,
  bewertungsschnitt: 2,
  telefon: 1,
  website: 1,
}

const LABEL: Record<keyof typeof GEWICHTE, string> = {
  fotos: 'Fotos im Profil',
  oeffnungszeiten: 'Öffnungszeiten hinterlegt',
  bewertungszahl: 'Anzahl Bewertungen',
  bewertungsschnitt: 'Durchschnittliche Bewertung',
  telefon: 'Telefonnummer im Profil',
  website: 'Website im Profil',
}

const SCHLUESSEL = Object.keys(GEWICHTE) as (keyof typeof GEWICHTE)[]

/** Kuerzere Namenskerne sind fuer einen Abgleich nicht belastbar. */
const MIN_KERN = 4

/** Ab hier gilt ein Schnitt als „im oberen Feld" — an der gemessenen Verteilung. */
const SCHNITT_HOCH = 4.8
const SCHNITT_MITTEL = 4.3

function vergleichbar(s: string): string {
  return kernName(s).replace(/\s+/g, '')
}

/**
 * Findet den eigenen Betrieb in der Trefferliste.
 *
 * Bewusst dieselbe Logik wie in `wett`: Beide Module muessen denselben Betrieb
 * finden, sonst widersprechen sich zwei Teile desselben Befunds.
 */
function findeEigenen(betriebe: Betrieb[], firmenname: string | null): Betrieb | null {
  if (!firmenname?.trim()) return null
  const gesucht = vergleichbar(firmenname)
  if (gesucht.length < MIN_KERN) return null

  return betriebe.find((b) => {
    const kandidat = vergleichbar(b.name)
    // ⚠ Leere und kurze Kerne AUSSCHLIESSEN, bevor verglichen wird:
    // `'meyer'.includes('')` ist true. Ein Betrieb, dessen Name nur aus
    // Gattungswoertern besteht, haette einen leeren Kern und gaebe sich als
    // jeder Betrieb aus.
    if (kandidat.length < MIN_KERN) return false
    return kandidat.includes(gesucht) || gesucht.includes(kandidat)
  }) ?? null
}

/** Stufenweise Punkte: der hoechste erreichte Schwellenwert gewinnt. */
function stufe(wert: number, schwellen: number[], punkte: number[]): number {
  for (let i = schwellen.length - 1; i >= 0; i--) {
    if (wert >= schwellen[i]) return punkte[i]
  }
  return 0
}

/**
 * Modul `gbp` — das Google-Unternehmensprofil des geprueften Betriebs.
 *
 * Das schwerste Modul des Katalogs und zugleich das einzige, dessen Maengel
 * ein Sachverstaendiger an einem Nachmittag selbst abstellen kann: Fotos
 * hochladen und Oeffnungszeiten eintragen kostet nichts ausser Zeit.
 *
 * Nur im Weg `bestand`: Wer noch aufbaut, hat kein Profil, das man beurteilen
 * koennte. Das ist keine Luecke, sondern der Ausgangspunkt.
 */
export async function messeGbp(
  k: Messkontext & { firmenname?: string | null },
): Promise<Messergebnis> {
  const erhoben = k.jetzt()

  if (k.modus === 'aufbau') {
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'gbp',
        grund: 'Ein Unternehmensprofil entsteht erst mit dem Betrieb — im Aufbau gibt es noch keines zu beurteilen.',
      }],
    }
  }

  if (!k.standort) {
    return {
      befunde: [],
      fehlstellen: [{ schluessel: 'gbp', grund: 'Ohne Standort ist das Profil nicht auffindbar.' }],
    }
  }

  const quelle = `Google Places · Unternehmensprofil · ${UMKREIS_KM} km um ${k.standort.ort ?? 'den Standort'}`

  let treffer: Betrieb[]
  let profil: Profil | null = null
  try {
    treffer = await k.places.suchText(SUCHBEGRIFF, { ...k.standort, km: UMKREIS_KM })
    const eigener = findeEigenen(treffer, k.firmenname ?? null)
    if (eigener) profil = await k.places.profil(eigener.placeId)
  } catch (err) {
    // ⚠ NIE als leeres Profil durchlassen — ein gesperrter Schluessel darf
    // nicht aussehen wie ein Betrieb, der sein Profil nicht pflegt. Der
    // Unterschied ist der ganze Sinn von R-B.
    const text = err instanceof PlacesFehler ? err.status : (err as Error).message
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'gbp',
        grund: `Die Kartensuche antwortete nicht verwertbar (${text}) — Profil nicht erhoben.`,
      }],
    }
  }

  if (!profil) {
    const grund = k.firmenname?.trim()
      ? `„${k.firmenname}" war in der Kartensuche nicht auffindbar — das Profil ließ sich nicht zuordnen.`
      : 'Für diesen Check ist kein Firmenname hinterlegt — das eigene Profil lässt sich nicht identifizieren.'
    return {
      befunde: SCHLUESSEL.map((s) => nichtErhoben(s, LABEL[s], GEWICHTE[s], grund, quelle, erhoben)),
      fehlstellen: [],
    }
  }

  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // 1 · Fotos
  //
  // ⚠ Places liefert hoechstens zehn. „10" heisst „mindestens 10" — der Befund
  // darf keine Obergrenze behaupten, die er nicht kennt.
  befunde.push(befund(
    'fotos', LABEL.fotos, profil.fotos,
    stufe(profil.fotos, [1, 4, 10], [2, 4, 6]), GEWICHTE.fotos, quelle, erhoben,
    profil.fotos === 0
      ? 'Kein einziges Foto. Profile mit Bildern werden deutlich häufiger angeklickt als solche ohne.'
      : profil.fotos >= 10
        ? 'Mindestens zehn hinterlegt — mehr zeigt die Kartensuche nicht an.'
        : `${profil.fotos} hinterlegt. Räume, Team und ein Fahrzeug in Begutachtung wirken stärker als ein Logo.`,
  ))

  // 2 · Öffnungszeiten
  befunde.push(befund(
    'oeffnungszeiten', LABEL.oeffnungszeiten, profil.oeffnungszeiten,
    profil.oeffnungszeiten ? GEWICHTE.oeffnungszeiten : 0, GEWICHTE.oeffnungszeiten, quelle, erhoben,
    profil.oeffnungszeiten
      ? 'Hinterlegt — die Kartensuche zeigt „geöffnet" bzw. „geschlossen" an.'
      : 'Nicht hinterlegt. Ohne Zeiten fehlt in der Kartensuche der Hinweis „jetzt geöffnet", und Anrufer wissen nicht, wann jemand rangeht.',
  ))

  // 3 · Anzahl Bewertungen — das staerkste Merkmal (gemessen 3 bis 95)
  const anzahl = profil.bewertungen ?? 0
  const umfeldZahlen = treffer.map((b) => b.bewertungen ?? 0).sort((a, b) => a - b)
  const median = umfeldZahlen.length > 0
    ? umfeldZahlen[Math.floor(umfeldZahlen.length / 2)]
    : 0
  befunde.push(befund(
    'bewertungszahl', LABEL.bewertungszahl, anzahl,
    stufe(anzahl, [1, 10, 30], [2, 4, 7]), GEWICHTE.bewertungszahl, quelle, erhoben,
    anzahl === 0
      ? `Noch keine Bewertung. Im Umkreis liegt der mittlere Betrieb bei ${median}.`
      : anzahl >= median
        ? `${anzahl} Bewertungen — über dem mittleren Betrieb im Umkreis (${median}).`
        : `${anzahl} Bewertungen. Der mittlere Betrieb im Umkreis hat ${median}, es fehlen also ${median - anzahl}.`,
  ))

  // 4 · Durchschnitt — schwaches Merkmal, deshalb nur zwei Punkte
  const schnitt = profil.bewertung
  if (schnitt === null) {
    befunde.push(nichtErhoben(
      'bewertungsschnitt', LABEL.bewertungsschnitt, GEWICHTE.bewertungsschnitt,
      'Ohne Bewertungen gibt es keinen Durchschnitt.', quelle, erhoben,
    ))
  } else {
    // ⚠ Die EINORDNUNG misst das tatsaechliche Umfeld, die PUNKTE folgen
    // festen Schwellen. Waeren auch die Punkte relativ, verloere ein Betrieb
    // Punkte, weil die Konkurrenz besser wird — obwohl er selbst nichts
    // veraendert hat.
    const bewertet = treffer.filter((b) => b.bewertung !== null)
    const perfekt = bewertet.filter((b) => (b.bewertung ?? 0) >= 5).length
    const anteil = bewertet.length > 0 ? Math.round((perfekt / bewertet.length) * 100) : 0

    befunde.push(befund(
      'bewertungsschnitt', LABEL.bewertungsschnitt, schnitt,
      stufe(schnitt, [SCHNITT_MITTEL, SCHNITT_HOCH], [1, 2]), GEWICHTE.bewertungsschnitt, quelle, erhoben,
      // ⚠ Komma, nicht Punkt: der Text steht im Befund eines deutschen Nutzers.
      `Durchschnitt ${schnitt.toFixed(1).replace('.', ',')}. Im Umkreis haben ${anteil} % der bewerteten Büros glatte 5,0 — ` +
      'ein guter Schnitt ist hier die Regel, kein Vorsprung. Entscheidend ist die Anzahl.',
    ))
  }

  // 5 + 6 · Telefon und Website — hatte im Bestand jeder, deshalb je ein Punkt
  befunde.push(befund(
    'telefon', LABEL.telefon, profil.telefon !== null,
    profil.telefon ? GEWICHTE.telefon : 0, GEWICHTE.telefon, quelle, erhoben,
    profil.telefon ? 'Im Profil hinterlegt.' : 'Keine Nummer im Profil — aus der Kartensuche heraus nicht anrufbar.',
  ))

  befunde.push(befund(
    'website', LABEL.website, profil.website !== null,
    profil.website ? GEWICHTE.website : 0, GEWICHTE.website, quelle, erhoben,
    profil.website ? `Verlinkt: ${profil.website}` : 'Keine Website im Profil verlinkt.',
  ))

  return { befunde, fehlstellen }
}
