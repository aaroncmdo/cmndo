import type { Db } from '../anreicherung/schreiben'
import type { PlacesAdapter } from '../places'
import { ladeCheck, type Check } from './check'
import { schlageWebsiteNach } from './eigener-betrieb'
import type { ModulId } from './registry'
import { bereinigeAuswahl, type Kontext } from './sperrlogik'

export type UmfangErgebnis =
  | {
      ok: true
      moduleAkzeptiert: ModulId[]
      moduleVerworfen: { id: ModulId; grund: string }[]
      punkteErhebbar: number
      /** Gesetzt, wenn die Website aus dem Google-Profil uebernommen wurde. */
      websiteUebernommen?: string
    }
  | { ok: false; error: string }

/**
 * Was das SYSTEM kann — unabhaengig vom einzelnen Check.
 *
 * Places haengt am Schluessel: mit dem Legacy-Adapter ist der Zugang da
 * (gemessen 18.08.), die New-API-Sperre (A-1) betrifft nur den anderen Pfad.
 * Ads und Meta brauchen Konten, die es noch nicht gibt (A-6) — ihre Module
 * erscheinen deshalb mit Sperrgrund im Klartext statt zu verschwinden.
 */
export function systemFaehigkeiten(): Pick<Kontext, 'hatPlacesZugang' | 'hatAdsKonto' | 'hatMetaKonto'> {
  return {
    hatPlacesZugang: Boolean(process.env.GOOGLE_PLACES_API_KEY),
    hatAdsKonto: Boolean(process.env.GOOGLE_ADS_CUSTOMER_ID),
    hatMetaKonto: Boolean(process.env.META_BUSINESS_ID),
  }
}

/** Check-Zustand + System-Faehigkeiten → der Kontext, gegen den gesperrt wird. */
export function baueKontext(check: Pick<Check, 'modus' | 'website_url' | 'gsc_freigabe_am'>): Kontext {
  return {
    modus: check.modus,
    hatUrl: Boolean(check.website_url?.trim()),
    hatGscFreigabe: Boolean(check.gsc_freigabe_am),
    ...systemFaehigkeiten(),
  }
}

/**
 * F-02 · Pruefumfang setzen.
 *
 * ⚠ Der Kern ist die TRENNUNG von Wunsch und Messbarem — laut Wellenplan „der
 * Fehler aus der ersten Umsetzung". `module_gewuenscht` behaelt, was der Nutzer
 * wollte; `module_gewaehlt` nur, was jetzt messbar ist. Wer ein Modul waehlt
 * und die URL spaeter nachtraegt, bekommt es zurueck — weil der Wunsch nie
 * geloescht wurde (T-02).
 *
 * Die Sperrlogik laeuft hier ERNEUT, obwohl der Client sie schon kennt: der
 * Client ist nicht vertrauenswuerdig (T-06).
 */
export async function setzePruefumfang(
  db: Db,
  token: string,
  moduleGewuenscht: string[],
  opts: { places?: PlacesAdapter } = {},
): Promise<UmfangErgebnis> {
  if (moduleGewuenscht.length === 0) return { ok: false, error: 'kein_modul' }

  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }
  if (check.status !== 'neu') return { ok: false, error: 'falscher_status' }

  const websiteUebernommen = await holeWebsiteFallsLeer(check, opts.places)

  const { akzeptiert, verworfen, punkteErhebbar } = bereinigeAuswahl(
    moduleGewuenscht as ModulId[],
    // ⚠ Der Kontext MUSS die nachgeschlagene Website kennen — sonst sperrt
    // `bereinigeAuswahl` die URL-Module, obwohl die Adresse gerade gefunden
    // wurde. Genau diese Reihenfolge ist der Kern des Fixes.
    baueKontext({ ...check, website_url: websiteUebernommen ?? check.website_url }),
  )

  // Ein Check ohne messbares Modul wuerde einen leeren Befund erzeugen und
  // dabei so aussehen, als sei gemessen worden.
  if (akzeptiert.length === 0) return { ok: false, error: 'kein_modul_messbar' }

  const { data: zeilen, error } = await db
    .from('levelup_checks')
    .update({
      module_gewuenscht: moduleGewuenscht,
      module_gewaehlt: akzeptiert,
      punkte_erhebbar: punkteErhebbar,
      // Nur schreiben, wenn wirklich nachgeschlagen wurde — sonst wuerde eine
      // vom Nutzer getippte Adresse ueberschrieben.
      ...(websiteUebernommen ? { website_url: websiteUebernommen } : {}),
    })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: `Umfang nicht speicherbar: ${error.message}` }
  if (!zeilen || zeilen.length === 0) {
    // Kein Fehler UND keine Zeile — der stille Fehlschlag.
    return { ok: false, error: 'update_wirkungslos' }
  }

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'umfang_bestaetigt',
    payload: {
      module: akzeptiert,
      verworfen,
      // Im Ereignis festhalten, WOHER die Adresse kam — sonst sieht ein
      // spaeterer Leser eine Website im Check und weiss nicht, ob der Nutzer
      // sie getippt hat oder wir sie aus dem Google-Profil uebernommen haben.
      ...(websiteUebernommen ? { website_aus_profil: websiteUebernommen } : {}),
    },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return {
    ok: true,
    moduleAkzeptiert: akzeptiert,
    moduleVerworfen: verworfen,
    punkteErhebbar,
    ...(websiteUebernommen ? { websiteUebernommen } : {}),
  }
}

/**
 * Schlaegt die Website im Google-Profil nach — aber NUR, wenn der Nutzer keine
 * angegeben hat.
 *
 * ⚠ DER BEFUND, DER DAS NOETIG MACHT (24.08.2026): Ohne Website sperrt
 * `bereinigeAuswahl` die Module `web` (12), `seo` (12) und `ux` (12) — 36 der
 * 106 gebauten Punkte. Uebrig bleiben 70, die Score-Schwelle liegt bei 75.
 * **Der Check erzeugt dann gar keinen Score**, nur einen Teilbefund. Gemessen
 * an echten Checks: die mit Website kamen auf 104 Punkte und Score 67/69, die
 * ohne auf 66 bzw. 57 — und blieben ohne Score.
 *
 * Gleichzeitig ruft `gbp` wenige Sekunden spaeter dasselbe Google-Profil ab, in
 * dem die Website steht, und bewertet sie mit EINEM Punkt statt sie zu nutzen.
 *
 * ⚠ Fehlschlaege sind hier IMMER harmlos: ohne Treffer bleibt alles wie zuvor,
 * die URL-Module werden gesperrt und der Nutzer sieht den Grund. Ein Fehler der
 * Kartensuche darf den Pruefumfang nicht kippen — deshalb der try/catch.
 *
 * ⚠ KOSTEN: zwei Places-Abrufe, aber NUR fuer Checks ohne getippte Website.
 * Wer eine Adresse eingibt, loest nichts aus. Die Suche laeuft genau einmal je
 * Check (`setzePruefumfang` ist durch `status='neu'` geschuetzt) und ein zweiter
 * Aufruf faende die Website bereits gesetzt vor.
 */
async function holeWebsiteFallsLeer(
  check: Check,
  places: PlacesAdapter | undefined,
): Promise<string | null> {
  if (check.website_url?.trim()) return null
  if (!check.firmenname?.trim()) return null
  if (check.standort_lat == null || check.standort_lng == null) return null
  if (!places && !systemFaehigkeiten().hatPlacesZugang) return null

  try {
    const adapter = places ?? (await import('../places')).holeAdapter()
    const nachschlag = await schlageWebsiteNach(
      adapter,
      { lat: check.standort_lat, lng: check.standort_lng },
      check.firmenname,
    )
    if (nachschlag.gefunden) return nachschlag.website
    console.info('[pruefumfang] Website nicht nachschlagbar:', nachschlag.grund)
    return null
  } catch (err) {
    // Kein Grund, den Pruefumfang scheitern zu lassen — der Nutzer bekommt
    // dann eben die Sperrgruende, die er ohne Nachschlag auch bekommen haette.
    console.error('[pruefumfang] Website-Nachschlag fehlgeschlagen:', err)
    return null
  }
}
