import type { Db } from '../anreicherung/schreiben'
import { ladeCheck, type Check } from './check'
import type { ModulId } from './registry'
import { bereinigeAuswahl, type Kontext } from './sperrlogik'

export type UmfangErgebnis =
  | {
      ok: true
      moduleAkzeptiert: ModulId[]
      moduleVerworfen: { id: ModulId; grund: string }[]
      punkteErhebbar: number
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
): Promise<UmfangErgebnis> {
  if (moduleGewuenscht.length === 0) return { ok: false, error: 'kein_modul' }

  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }
  if (check.status !== 'neu') return { ok: false, error: 'falscher_status' }

  const { akzeptiert, verworfen, punkteErhebbar } = bereinigeAuswahl(
    moduleGewuenscht as ModulId[],
    baueKontext(check),
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
    payload: { module: akzeptiert, verworfen },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true, moduleAkzeptiert: akzeptiert, moduleVerworfen: verworfen, punkteErhebbar }
}
