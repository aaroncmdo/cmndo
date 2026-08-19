import { PlacesFehler, type Betrieb } from '../../places'
import { kernName } from '../../anreicherung/kern-name'
import { befund, nichtErhoben, type Befund, type Fehlstelle, type Messergebnis, type Messkontext } from '../modul-vertrag'

/** Muss der Modulpunktzahl aus der Registry entsprechen (`wett: 18`). */
export const WETT_PUNKTE = 18
export const UMKREIS_KM = 50
export const SUCHBEGRIFF = 'Kfz-Sachverständiger'

/**
 * Punktverteilung — BESCHLUSS (die Messvorschrift `references/scoring-modell.md`
 * ist nicht auffindbar, s. `web.ts`).
 *
 * 16 Punkte Basis + 2 Punkte Bewertungs-Dynamik = 18. Die zwei Zusatzpunkte
 * sind Design-Spec §3.5: gewertet wird die RATE, nicht der Bestand — wer im
 * letzten Quartal fuenf Bewertungen gesammelt hat, ist auf dem Weg nach oben,
 * auch wenn der Bestand niedrig ist.
 */
export const GEWICHTE = { sichtbar: 4, rang: 8, median: 4, dynamik: 2 }

/** Kuerzere Namenskerne sind fuer einen Abgleich nicht belastbar. */
const MIN_KERN = 4

function medianVon(zahlen: number[]): number {
  if (zahlen.length === 0) return 0
  const s = [...zahlen].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 === 0 ? (s[m - 1] + s[m]) / 2 : s[m]
}

/**
 * Der Wert, AB DEM das obere (1-p)-Viertel beginnt.
 *
 * ⚠ `Math.ceil`, nicht `floor`: Die Aussage im Befund lautet „oberes Viertel ab
 * X". Bei elf Betrieben mit 0,10,…,100 sind die besten 25 % die drei mit
 * 80/90/100 — das Viertel beginnt also bei 80, nicht bei 70. Mit `floor` wäre
 * die Schwelle systematisch zu niedrig und jeder Betrieb sähe besser aus, als
 * er steht.
 */
function perzentil(zahlen: number[], p: number): number {
  if (zahlen.length === 0) return 0
  const s = [...zahlen].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil((s.length - 1) * p))]
}

/**
 * Vergleichbarer Name — ueber den KERN, nicht ueber die ganze Zeichenkette.
 *
 * ⚠ Am echten Lauf gefunden (18.08.): Google fuehrt den Betrieb als
 * „KFZ Sachverständigenbüro Berkay Yigit Münster", der Nutzer tippt
 * „Gutachter Yigit". Ein Substring-Vergleich scheitert, weil die
 * GATTUNGSWOERTER verschieden sind — und genau die entfernt `kernName`
 * (samt Unicode-Schmuckschrift, die im Bestand vorkommt).
 */
function vergleichbar(s: string): string {
  return kernName(s).replace(/\s+/g, '')
}

/**
 * Findet den eigenen Betrieb in der Trefferliste.
 *
 * ⚠ Braucht den Firmennamen. `levelup_checks` fuehrt ihn NICHT (nur
 * `sv_lead_id`) — beim Massenlauf kommt er aus `sv_leads.firma`, beim
 * oeffentlichen Check ist er unbekannt. Dann bleibt das Modul fuer
 * `modus='bestand'` unmessbar, und genau das steht als Fehlstelle im Befund
 * statt als schlechter Rang (R-B).
 */
function findeEigenen(betriebe: Betrieb[], firmenname: string | null): Betrieb | null {
  if (!firmenname?.trim()) return null
  const gesucht = vergleichbar(firmenname)
  if (gesucht.length < MIN_KERN) return null

  return betriebe.find((b) => {
    const kandidat = vergleichbar(b.name)
    // ⚠ Kurze und leere Kerne MÜSSEN ausgeschlossen werden, bevor verglichen
    // wird: `'meyer'.includes('')` ist true. Ein Betrieb, dessen Name nur aus
    // Gattungswörtern besteht ("Sachverständigenbüro"), hat einen leeren Kern
    // und würde als JEDER Betrieb erkannt. Am eigenen Test aufgefallen, wo
    // "Buero 0" sich als gesuchter Betrieb ausgab.
    if (kandidat.length < MIN_KERN) return false
    return kandidat.includes(gesucht) || gesucht.includes(kandidat)
  }) ?? null
}

/**
 * Modul `wett` — Wettbewerber im 50-km-Umkreis.
 *
 * Der Unterschied zwischen den Wegen ist fachlich, nicht technisch:
 *
 *   `aufbau`   Der Betrieb existiert noch nicht. Es gibt keinen Rang zu messen —
 *              0 von 18 Punkten sind das ERGEBNIS, kein Mangel. Der Wert des
 *              Moduls liegt im Marktbild: wie viele, wie stark, wo die Latte
 *              haengt.
 *   `bestand`  Der Rang ist die zentrale Aussage („Wo Sie im Feld stehen").
 */
export async function messeWett(
  k: Messkontext & { firmenname?: string | null },
): Promise<Messergebnis> {
  const erhoben = k.jetzt()

  if (!k.standort) {
    return {
      befunde: [],
      fehlstellen: [{ schluessel: 'wett', grund: 'Ohne Standort ist kein Umkreis bestimmbar.' }],
    }
  }

  let betriebe: Betrieb[]
  try {
    betriebe = await k.places.suchText(SUCHBEGRIFF, { ...k.standort, km: UMKREIS_KM })
  } catch (err) {
    // ⚠ NIE als „0 Wettbewerber" durchlassen — das waere ein Befund, den es
    // nicht gibt. Ein gesperrter Schluessel darf nicht wie ein leerer Markt
    // aussehen.
    const text = err instanceof PlacesFehler ? err.status : (err as Error).message
    return {
      befunde: [],
      fehlstellen: [{
        schluessel: 'wett',
        grund: `Die Kartensuche antwortete nicht verwertbar (${text}) — Wettbewerbsumfeld nicht erhoben.`,
      }],
    }
  }

  const bewertungen = betriebe.map((b) => b.bewertungen ?? 0)
  const median = medianVon(bewertungen)
  const oberesViertel = perzentil(bewertungen, 0.75)

  /**
   * ⚠ WORAUF SICH DIESE ZAHLEN BEZIEHEN — R-A in seiner strengen Lesart.
   *
   * Die Kartensuche sortiert nach Relevanz und liefert höchstens 60 Treffer.
   * Das ist die **Spitzengruppe**, nicht der Markt. Am 18.08. in Münster
   * gemessen: Median 70 Bewertungen über diese 60 — die Vollerhebung über alle
   * 154 Büros des Gebiets ergab am 12.08. einen Median von 11.
   *
   * Wer „Median im Gebiet" schreibt, macht daraus eine Aussage über den Markt,
   * die systematisch GEGEN den Geprüften ausfällt: ein Betrieb mit 20
   * Bewertungen läge über dem echten Marktmedian, erscheint hier aber weit
   * darunter. Deshalb benennt jede Einordnung die Bezugsgruppe ausdrücklich.
   *
   * Die Vollerhebung braucht ein Raster über das Gebiet (mehrere Abfragen) —
   * das ist der Quadtree aus Design-Spec §7.2 und gehört zu P6, nicht hierher.
   */
  const bezugsgruppe = betriebe.length >= 60
    ? `die ${betriebe.length} sichtbarsten Büros`
    : `alle ${betriebe.length} gefundenen Büros`
  const quelle =
    `Google Places · ${SUCHBEGRIFF} · ${UMKREIS_KM} km um ${k.standort.ort ?? 'den Standort'} · ` +
    `Vergleichsgruppe: ${bezugsgruppe}`
  const marktbild =
    `${betriebe.length} Büros gefunden. Median ${median} Bewertungen, oberes Viertel ab ` +
    `${oberesViertel} — bezogen auf ${bezugsgruppe}` +
    (betriebe.length >= 60
      ? '. Die Kartensuche liefert höchstens 60 Treffer und sortiert nach Relevanz; der Median der Spitzengruppe liegt deutlich über dem des gesamten Gebiets.'
      : '.')

  const befunde: Befund[] = []
  const fehlstellen: Fehlstelle[] = []

  // Marktbild — bei beiden Wegen dieselbe Zahl, aber ohne eigene Punktwertung:
  // die Marktgroesse ist keine Leistung des Sachverstaendigen.
  befunde.push(befund(
    'marktgroesse', 'Büros im 50-km-Umkreis', betriebe.length,
    0, 0, quelle, erhoben, marktbild,
  ))

  if (k.modus === 'aufbau') {
    // Kein Rang zu messen — 0 Punkte sind hier das Ergebnis, nicht ein Mangel.
    befunde.push(befund(
      'sichtbar', 'In der Kartensuche auffindbar', false,
      0, GEWICHTE.sichtbar, quelle, erhoben,
      'Ein neuer Betrieb erscheint noch nicht in der Kartensuche — das ist der Ausgangspunkt.',
    ))
    befunde.push(befund(
      'rang', 'Position nach Bewertungszahl', `${betriebe.length + 1}. von ${betriebe.length + 1}`,
      0, GEWICHTE.rang, quelle, erhoben,
      `Ohne Bewertungen steht ein Betrieb hinter allen ${betriebe.length} bereits sichtbaren.`,
    ))
    befunde.push(befund(
      'median', 'Abstand zum Median', `0 von ${median}`,
      0, GEWICHTE.median, quelle, erhoben,
      `Um den Median einzuholen, sind ${median} Bewertungen nötig.`,
    ))
    befunde.push(nichtErhoben(
      'dynamik', 'Bewertungs-Dynamik', GEWICHTE.dynamik,
      'Eine Rate braucht zwei Messzeitpunkte — beim ersten Check nicht bestimmbar.',
      quelle, erhoben,
    ))
    return { befunde, fehlstellen }
  }

  // modus === 'bestand'
  const eigener = findeEigenen(betriebe, k.firmenname ?? null)

  if (!eigener) {
    const grund = k.firmenname?.trim()
      ? `„${k.firmenname}" war in der Kartensuche nicht auffindbar — Rang nicht bestimmbar.`
      : 'Für diesen Check ist kein Firmenname hinterlegt — der eigene Eintrag lässt sich in der Kartensuche nicht identifizieren.'

    for (const s of ['sichtbar', 'rang', 'median', 'dynamik'] as const) {
      befunde.push(nichtErhoben(s, s, GEWICHTE[s], grund, quelle, erhoben))
    }
    return { befunde, fehlstellen }
  }

  const eigeneBewertungen = eigener.bewertungen ?? 0
  const besser = bewertungen.filter((n) => n > eigeneBewertungen).length
  const rang = besser + 1

  befunde.push(befund(
    'sichtbar', 'In der Kartensuche auffindbar', true,
    GEWICHTE.sichtbar, GEWICHTE.sichtbar, quelle, erhoben,
    `Gefunden als „${eigener.name}".`,
  ))

  // Rang: linear vom letzten (0) zum ersten (volle Punkte)
  const anteilBesser = betriebe.length > 1 ? (betriebe.length - rang) / (betriebe.length - 1) : 1
  befunde.push(befund(
    'rang', 'Position nach Bewertungszahl', `${rang}. von ${betriebe.length}`,
    Math.round(anteilBesser * GEWICHTE.rang), GEWICHTE.rang, quelle, erhoben,
    marktbild,
  ))

  const medianPunkte = eigeneBewertungen >= oberesViertel ? GEWICHTE.median
    : eigeneBewertungen >= median ? Math.round(GEWICHTE.median / 2)
    : 0
  befunde.push(befund(
    'median', 'Abstand zum Median', `${eigeneBewertungen} von ${median}`,
    medianPunkte, GEWICHTE.median, quelle, erhoben,
    eigeneBewertungen >= median
      ? `Über dem Median (${median}); oberes Viertel ab ${oberesViertel}.`
      : `Unter dem Median (${median}) — ${median - eigeneBewertungen} Bewertungen fehlen dorthin.`,
  ))

  befunde.push(nichtErhoben(
    'dynamik', 'Bewertungs-Dynamik', GEWICHTE.dynamik,
    'Eine Rate braucht zwei Messzeitpunkte — beim ersten Check nicht bestimmbar.',
    quelle, erhoben,
  ))

  return { befunde, fehlstellen }
}
