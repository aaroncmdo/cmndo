import { kernName } from '../anreicherung/kern-name'
import type { Betrieb, PlacesAdapter, Umkreis } from '../places'

/**
 * Den eigenen Betrieb in einer Places-Trefferliste erkennen — und daraus
 * nachschlagen, was Google ueber ihn weiss.
 *
 * ⚠ WARUM ES DIESE DATEI GIBT: `findeEigenen` stand WORTGLEICH in `gbp.ts` und
 * `wett.ts`. Der Kommentar dort verlangte ausdruecklich, dass beide dieselbe
 * Logik haben ("sonst widersprechen sich zwei Teile desselben Befunds") — per
 * Kopie laesst sich das aber nicht garantieren, sondern nur hoffen. Mit dem
 * dritten Aufrufer (Website-Nachschlag im Pruefumfang) war der Punkt erreicht,
 * an dem eine Quelle billiger ist als drei Hoffnungen.
 */

/** Kuerzere Namenskerne sind fuer einen Abgleich nicht belastbar. */
export const MIN_KERN = 4

/**
 * Reduziert einen Firmennamen auf seinen unterscheidenden Kern.
 *
 * Zwei Eintraege desselben Betriebs unterscheiden sich fast immer nur in den
 * GATTUNGSWOERTERN — und genau die entfernt `kernName` (samt Unicode-
 * Schmuckschrift, die im Bestand vorkommt).
 */
export function vergleichbar(s: string): string {
  return kernName(s).replace(/\s+/g, '')
}

/**
 * Findet den eigenen Betrieb in der Trefferliste.
 *
 * ⚠ Braucht den Firmennamen. Fehlt er, bleibt das Ergebnis `null` — und die
 * Module machen daraus eine Fehlstelle mit Grund statt eines schlechten Rangs
 * (R-B: nichts erfinden).
 */
export function findeEigenen(betriebe: Betrieb[], firmenname: string | null): Betrieb | null {
  if (!firmenname?.trim()) return null
  const gesucht = vergleichbar(firmenname)
  if (gesucht.length < MIN_KERN) return null

  return betriebe.find((b) => {
    const kandidat = vergleichbar(b.name)
    // ⚠ Kurze und leere Kerne MUESSEN ausgeschlossen werden, BEVOR verglichen
    // wird: `'meyer'.includes('')` ist true. Ein Betrieb, dessen Name nur aus
    // Gattungswoertern besteht ("Sachverstaendigenbuero"), hat einen leeren
    // Kern und wuerde als JEDER Betrieb erkannt. Am eigenen Test aufgefallen,
    // wo "Buero 0" sich als gesuchter Betrieb ausgab.
    if (kandidat.length < MIN_KERN) return false
    return kandidat.includes(gesucht) || gesucht.includes(kandidat)
  }) ?? null
}

/** Der Suchbegriff, unter dem die Betriebe bei Google gefuehrt werden. */
export const SUCHBEGRIFF = 'Kfz-Sachverständiger'
/** Enger Umkreis: der eigene Betrieb liegt am angegebenen Standort, nicht daneben. */
export const NACHSCHLAG_KM = 15

export type WebsiteNachschlag =
  | { gefunden: true; website: string; placeId: string; firmenname: string }
  | { gefunden: false; grund: string }

/**
 * Schlaegt die Website eines Betriebs im Google-Unternehmensprofil nach.
 *
 * ⚠ WARUM DAS NOETIG IST — der Befund vom 24.08.: Wer beim Einstieg das
 * Website-Feld leer laesst, verliert `web` (12), `seo` (12) und `ux` (12) —
 * 36 der 106 gebauten Punkte. Uebrig bleiben 70, die Score-Schwelle liegt bei
 * 75: **der Check erzeugt dann GAR KEINEN Score**, nur einen Teilbefund.
 * Gleichzeitig ruft `gbp` im selben Durchlauf das Google-Profil ab, in dem die
 * Website steht — und bewertet sie mit EINEM Punkt, statt sie zu benutzen.
 *
 * ⭐ Zwei Abrufe, kein Weg daran vorbei: Die Legacy-Textsuche liefert die
 * Website NICHT mit (siehe `places/adapter.ts`), deshalb erst suchen, dann
 * `websiteVon` mit `fields=website` — die guenstigste Details-Stufe.
 *
 * ⚠ Der Aufrufer MUSS vorher pruefen, ob schon eine Website bekannt ist. Diese
 * Funktion fragt nicht nach; sie sucht immer, wenn sie gerufen wird.
 */
export async function schlageWebsiteNach(
  places: PlacesAdapter,
  standort: Umkreis | { lat: number; lng: number },
  firmenname: string | null,
): Promise<WebsiteNachschlag> {
  if (!firmenname?.trim()) {
    return { gefunden: false, grund: 'kein Firmenname hinterlegt' }
  }
  if (vergleichbar(firmenname).length < MIN_KERN) {
    return { gefunden: false, grund: 'Firmenname besteht nur aus Gattungswörtern' }
  }

  const umkreis: Umkreis = { lat: standort.lat, lng: standort.lng, km: NACHSCHLAG_KM }

  let treffer: Betrieb[]
  try {
    treffer = await places.suchText(SUCHBEGRIFF, umkreis)
  } catch (err) {
    // ⚠ Ein Fehler der Kartensuche darf NICHT wie "kein Eintrag gefunden"
    // aussehen — sonst verliert der Betrieb 36 Punkte wegen einer Stoerung.
    // Der Grund wandert in den Befund (R-B).
    return { gefunden: false, grund: `Kartensuche nicht erreichbar (${(err as Error).message})` }
  }

  const eigener = findeEigenen(treffer, firmenname)
  if (!eigener) {
    return { gefunden: false, grund: `„${firmenname}" war in der Kartensuche nicht auffindbar` }
  }

  let website: string | null
  try {
    website = await places.websiteVon(eigener.placeId)
  } catch (err) {
    return { gefunden: false, grund: `Profil nicht abrufbar (${(err as Error).message})` }
  }

  if (!website?.trim()) {
    return { gefunden: false, grund: 'im Google-Profil ist keine Website hinterlegt' }
  }

  return { gefunden: true, website: website.trim(), placeId: eigener.placeId, firmenname: eigener.name }
}
