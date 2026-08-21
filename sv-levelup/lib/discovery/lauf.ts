import type { Betrieb, PlacesAdapter } from '../places'
import { PlacesFehler } from '../places'
import type { Db } from '../anreicherung/schreiben'
import { mittelpunkt, radiusKm, startKacheln, vierteile, MAX_RADIUS_KM, type Kachel } from './kacheln'
import { beurteile, schreibeFund, type BestandsZeile, type Entscheidung, type Fund } from './schreiben'

/**
 * Der Discovery-Lauf.
 *
 * ⚠ Kosten fallen auch im Trockenlauf an. `schreiben: false` unterdrueckt das
 * SCHREIBEN, nicht die Abrufe — ein Trockenlauf ueber Deutschland kostet
 * genauso viel wie ein scharfer.
 */

/**
 * Pause zwischen zwei Kachel-Abrufen.
 *
 * ⚠ Am Deutschland-Lauf gemessen: ohne Pause fielen 1.119 von 1.392
 * Abrufen mit „fetch failed" aus — 80 %. Der Lauf meldete die Fehler zwar,
 * lieferte aber trotzdem 2.864 Betriebe und sah damit erfolgreich aus.
 * Eine Viertelsekunde je Kachel kostet bei 700 Kacheln knapp drei Minuten
 * und rettet den Rest des Landes.
 */
export const PAUSE_MS = 250

/** Ab so vielen Treffern gilt die Kartensuche als gedeckelt (Legacy: 3 Seiten à 20). */
export const DECKEL = 60

export type Bericht = {
  laufId: string
  kacheln: number
  verfeinert: number
  /** Kacheln, die auch auf der letzten Stufe noch deckelten — bekannte Luecken. */
  gedeckeltAmEnde: number
  abrufe: number
  bruttoFunde: number
  eindeutig: number
  je: Record<Entscheidung, number>
  fehler: string[]
  dauerMs: number
  /**
   * Eine Stichprobe der Funde, je Entscheidung.
   *
   * ⭐ P2s teuerste Lehre: 140 gruene Tests und zwei vollstaendige Trockenlaeufe
   * zeigten nichts — erst der scharfe Lauf auf fuenf echte Leads foerderte vier
   * Fehler zutage, alle in der Form „Wert vorhanden, Wert unbrauchbar". Der
   * Grund: in einem Trockenlauf schaut niemand die WERTE an, nur die Zahlen.
   * Also zeigt der Bericht sie.
   */
  proben: Record<Entscheidung, string[]>
}

/** So viele Beispiele je Entscheidung — genug zum Hinsehen, wenig genug zum Lesen. */
const PROBEN_JE = 12

export type Stand = { kachel: number; vonKacheln: number; funde: number }

export type LaufOpts = {
  places: PlacesAdapter
  db: Db
  gebiet: Kachel
  begriffe: string[]
  maxTiefe: number
  schreiben: boolean
  laufId: string
  /** Bestehende Leads — einmal geladen, nicht je Fund abgefragt. */
  bestand: BestandsZeile[]
  /**
   * Hoechstens so viele NEUE Leads anlegen (nur bei `schreiben`).
   *
   * ⚠ Fuer den ersten scharfen Lauf: zehn echte Datensaetze lassen sich
   * einzeln ansehen, hundertsiebenundachtzig nicht. Gezaehlt wird trotzdem
   * alles — der Bericht bleibt vollstaendig.
   */
  maxNeu?: number
  jetzt?: () => number
  /** Injizierbar, damit Tests nicht warten. */
  warte?: (ms: number) => Promise<void>
  fortschritt?: (s: Stand) => void
  /**
   * Fortsetzen: die noch offene Warteschlange eines abgebrochenen Laufs.
   *
   * Ohne sie beginnt der Lauf bei `startKacheln(gebiet)`.
   */
  offeneKacheln?: Kachel[]
  /**
   * Wird nach JEDER Kachel gerufen — mit dem, was noch aussteht.
   *
   * ⚠ Der Deutschland-Lauf dauert ueber eine Stunde. Am 21.08. wurde einer bei
   * Kachel 233 von 256 abgebrochen: die gefundenen Betriebe standen in der
   * Datenbank (sie werden sofort geschrieben), aber die WARTESCHLANGE war weg —
   * und damit jede Verfeinerung, die noch ausstand. Verfeinert werden genau die
   * dichten Kacheln, also die Staedte. Ein Neustart haette alle 256 Kacheln
   * erneut abgefragt und bezahlt, nur um an dieselbe Stelle zu kommen.
   */
  sichere?: (offen: Kachel[], bericht: Bericht) => void
}

export async function entdecke(o: LaufOpts): Promise<Bericht> {
  const uhr = o.jetzt ?? (() => Date.now())
  const warte = o.warte ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)))
  const start = uhr()

  const bericht: Bericht = {
    laufId: o.laufId,
    kacheln: 0,
    verfeinert: 0,
    gedeckeltAmEnde: 0,
    abrufe: 0,
    bruttoFunde: 0,
    eindeutig: 0,
    je: { neu: 0, dublette_place_id: 0, dublette_name: 0, unbrauchbar: 0 },
    fehler: [],
    dauerMs: 0,
    proben: { neu: [], dublette_place_id: [], dublette_name: [], unbrauchbar: [] },
  }

  // Der Bestand waechst mit: ein im Lauf angelegter Betrieb muss beim naechsten
  // Fund als Dublette erkannt werden. Sonst legen zwei ueberlappende Kacheln
  // denselben Betrieb zweimal an.
  const bestand = [...o.bestand]
  const gesehen = new Set<string>(bestand.map((b) => b.googlePlaceId).filter((x): x is string => Boolean(x)))

  // Fortsetzen, wenn eine Warteschlange uebergeben wurde — sonst von vorn.
  const offen: Kachel[] = o.offeneKacheln ?? startKacheln(o.gebiet, MAX_RADIUS_KM)
  const gesamtStart = offen.length
  let geschrieben = 0

  while (offen.length > 0) {
    const kachel = offen.shift()!
    bericht.kacheln++
    o.fortschritt?.({ kachel: bericht.kacheln, vonKacheln: gesamtStart, funde: bericht.eindeutig })

    const mitte = mittelpunkt(kachel)
    const umkreis = { lat: mitte.lat, lng: mitte.lng, km: Math.min(radiusKm(kachel), MAX_RADIUS_KM) }

    let gedeckelt = false

    for (const begriff of o.begriffe) {
      if (bericht.abrufe > 0) await warte(PAUSE_MS)
      let treffer: Betrieb[]
      try {
        treffer = await o.places.suchText(begriff, umkreis)
        bericht.abrufe++
      } catch (err) {
        // ⚠ Ein Ausfall beendet den Lauf NICHT. Sonst entscheidet ein einzelner
        // fremder Fehler ueber zehntausend Abrufe — und man faengt von vorn an.
        const t = err instanceof PlacesFehler ? err.status : (err as Error).message
        bericht.fehler.push(`${mitte.lat.toFixed(2)}/${mitte.lng.toFixed(2)} „${begriff}": ${t}`)
        continue
      }

      bericht.bruttoFunde += treffer.length
      if (treffer.length >= DECKEL) gedeckelt = true

      for (const b of treffer) {
        if (gesehen.has(b.placeId)) {
          bericht.je.dublette_place_id++
          continue
        }
        gesehen.add(b.placeId)
        bericht.eindeutig++

        const fund: Fund = {
          placeId: b.placeId, name: b.name, adresse: b.adresse, lat: b.lat, lng: b.lng,
        }
        const entscheidung = beurteile(fund, bestand)
        bericht.je[entscheidung]++
        if (bericht.proben[entscheidung].length < PROBEN_JE) {
          bericht.proben[entscheidung].push(`${b.name} — ${b.adresse ?? 'ohne Anschrift'}`)
        }

        if (!o.schreiben) continue
        if (entscheidung === 'neu' && o.maxNeu !== undefined && geschrieben >= o.maxNeu) continue

        const treffer2 = entscheidung === 'dublette_name'
          ? bestand.find((x) =>
              beurteile(fund, [x]) === 'dublette_name') ?? null
          : null

        const r = await schreibeFund(o.db, fund, o.laufId, entscheidung, treffer2)
        if (!r.ok) {
          bericht.fehler.push(`„${b.name}": ${r.error}`)
          continue
        }

        // Neu angelegte Betriebe gehoeren sofort in den Bestand — sonst legt
        // die naechste ueberlappende Kachel denselben noch einmal an.
        if (entscheidung === 'neu') {
          geschrieben++
          bestand.push({ id: 'im-lauf', firma: b.name, lat: b.lat, lng: b.lng, googlePlaceId: b.placeId })
        }
      }
    }

    // ⚠ 60 Treffer heissen „MINDESTENS 60", nicht „genau 60". Wer hier
    // aufhoert, verliert genau die dichten Gebiete — also die Staedte, in denen
    // die meisten Bueros sitzen.
    if (gedeckelt) {
      if (kachel.tiefe < o.maxTiefe) {
        offen.push(...vierteile(kachel))
        bericht.verfeinert++
      } else {
        // Eine bekannte Luecke. Sie stillschweigend hinzunehmen hiesse, eine
        // Vollerhebung zu behaupten, die keine ist (R-B).
        bericht.gedeckeltAmEnde++
      }
    }

    // ⚠ ERST NACH der Verfeinerung sichern. Wer vorher sichert, verliert genau
    // die Kacheln, die diese hier gerade erzeugt hat — und das faellt nicht
    // auf, weil der Lauf ohne Fehler weiterlaeuft.
    o.sichere?.(offen, bericht)
  }

  bericht.dauerMs = uhr() - start
  return bericht
}
