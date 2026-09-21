// Standort-Ermittlung fuer Sachverstaendige — EIN Weg fuer alle Selbst-Pfade.
//
// Warum es das gibt (Aaron 21.09.2026: "die Geocodierung soll ja eigentlich auch schon im
// Self-Onboarding passieren"): Ohne Koordinaten ist ein SV auf der Karte unsichtbar
// (Finder-RLS verlangt lat/lng NOT NULL) und im Dispatch unerreichbar (das Matching prueft,
// ob seine Isochrone den Schadenort deckt). Er sieht ein fertiges Profil und bekommt null
// Auftraege — ohne Hinweis, woran es liegt. Vor diesem Helfer verliessen sich drei von vier
// Selbst-Pfaden darauf, dass der BROWSER Koordinaten mitliefert: wer die Adresse frei tippt
// statt einen Vorschlag anzuklicken, kam ohne durch.
//
// ⚠ Die PLZ gehoert IN die Anfrage, nicht nur in die Pruefung. Auf prod sass ein aktiver SV
// laut PLZ in Heiligenthal und laut Koordinaten 563 km entfernt in Niederbayern; seine
// Isochrone lag komplett dort, in seiner echten Region war er unsichtbar. Ursache war ein
// Geocoding OHNE Ortsbezug — die Strasse allein wurde irgendwo in Deutschland aufgeloest.
// Deshalb zwei Vorkehrungen: die Suchadresse traegt die PLZ (baueSuchadresse), und der
// Treffer wird gegen den PLZ-Mittelpunkt plausibilisiert (istPlausibel). Belegt und
// beschrieben in src/lib/sv-basic/freigabe.ts, von dort kommt auch die Schwelle.
//
// Dienst ist Mapbox. Googles Abrechnung ist seit 28.08.2026 aus (REQUEST_DENIED), der
// Google-Fallback in geocodeMitFallback faengt also nichts mehr ab — hier wird bewusst
// direkt der Mapbox-Geocoder genutzt, damit ein Fehlschlag als Fehlschlag sichtbar wird
// statt als Umweg ueber einen toten Dienst.

import type { SupabaseClient } from '@supabase/supabase-js'
import { haversineKm } from '@/lib/gps/geofence'
import { STANDORT_PLAUSIBILITAET_MAX_KM } from '@/lib/sv-basic/freigabe'

/** Woher die Koordinaten stammen — fuer Logs und Tests, nie fuer die Fachlogik. */
export type StandortQuelle = 'client' | 'mapbox' | 'plz-mittelpunkt'

export type StandortErgebnis =
  | { ok: true; lat: number; lng: number; quelle: StandortQuelle }
  | { ok: false; grund: 'keine-angabe' | 'nicht-aufloesbar' }

export type StandortEingabe = {
  adresse?: string | null
  plz?: string | null
  /** Koordinaten aus dem Adress-Vorschlag im Browser. Vorhanden = nichts zu tun. */
  lat?: number | null
  lng?: number | null
}

export type GeoPunkt = { lat: number; lng: number }

/** Fuenfstellige deutsche PLZ, als eigenes Wort. */
const PLZ_MUSTER = /(?<!\d)(\d{5})(?!\d)/

/** Liest die PLZ aus einem Adress-Freitext ("Musterstr. 1, 42103 Wuppertal" -> "42103"). */
export function findePlzInAdresse(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  return PLZ_MUSTER.exec(adresse)?.[1] ?? null
}

/**
 * Baut die Adresse, die an den Geocoder geht.
 *
 * Die PLZ wird angehaengt, wenn sie nicht ohnehin schon im Text steht — doppelt schadet der
 * Trefferqualitaet, ganz ohne ist der 563-km-Fall. Ohne jeden Ortsbezug (weder PLZ im Text
 * noch als Feld) wird bewusst `null` zurueckgegeben: dann ist eine Strassen-Anfrage
 * gefaehrlicher als gar keine, und der Aufrufer faellt auf die PLZ-Stufe oder auf einen
 * sichtbaren Fehler zurueck.
 */
export function baueSuchadresse(
  adresse: string | null | undefined,
  plz: string | null | undefined,
): string | null {
  const a = adresse?.trim() ?? ''
  const p = plz?.trim() ?? ''

  if (!a) return p ? p : null
  if (!p) return findePlzInAdresse(a) ? a : null
  if (findePlzInAdresse(a) === p) return a
  return `${a}, ${p}`
}

/**
 * Liegt der Treffer plausibel zur PLZ?
 *
 * Fail-open, wenn die PLZ unbekannt ist (`plzGeo === null`): eine Luecke in der
 * Referenztabelle darf keinen korrekten Standort verwerfen — dieselbe Entscheidung wie im
 * Freigabe-Guard.
 */
export function istPlausibel(
  treffer: GeoPunkt,
  plzGeo: GeoPunkt | null,
  maxKm: number = STANDORT_PLAUSIBILITAET_MAX_KM,
): boolean {
  if (!plzGeo) return true
  return haversineKm(treffer.lat, treffer.lng, plzGeo.lat, plzGeo.lng) <= maxKm
}

/**
 * Testbare Fabrik — die Reihenfolge der Stufen ist die eigentliche Fachlogik und wird hier
 * ohne Netz und ohne Datenbank geprueft. Muster wie makeGeocodeMitFallback.
 */
export function macheStandortErmittler(deps: {
  geocode: (adresse: string) => Promise<GeoPunkt | null>
  plzMittelpunkt: (plz: string) => Promise<GeoPunkt | null>
}) {
  return async function ermittle(eingabe: StandortEingabe): Promise<StandortErgebnis> {
    // Stufe 1 — der Browser hat einen Vorschlag geliefert. Kein Aufruf noetig.
    if (eingabe.lat != null && eingabe.lng != null) {
      return { ok: true, lat: eingabe.lat, lng: eingabe.lng, quelle: 'client' }
    }

    const plz = eingabe.plz?.trim() || findePlzInAdresse(eingabe.adresse)
    const suche = baueSuchadresse(eingabe.adresse, plz)
    if (!suche) return { ok: false, grund: 'keine-angabe' }

    // Der PLZ-Mittelpunkt dient zweimal: als Pruefmass fuer Stufe 2 und als Rueckfallebene
    // in Stufe 3. Er kommt aus der eigenen Tabelle, kostet also keinen fremden Aufruf.
    const referenz = plz ? await deps.plzMittelpunkt(plz) : null

    // Stufe 2 — Mapbox auf die vollstaendige Adresse.
    const treffer = await deps.geocode(suche)
    if (treffer && istPlausibel(treffer, referenz)) {
      return { ok: true, lat: treffer.lat, lng: treffer.lng, quelle: 'mapbox' }
    }

    // Stufe 3 — PLZ-Mittelpunkt. Gegenueber dem Hausnummer-genauen Treffer ungenau, aber in
    // der richtigen Region: der SV ist damit auffindbar und buchbar, statt unsichtbar zu
    // sein. Greift auch, wenn Stufe 2 einen unplausiblen Treffer lieferte.
    if (referenz) {
      return { ok: true, lat: referenz.lat, lng: referenz.lng, quelle: 'plz-mittelpunkt' }
    }

    return { ok: false, grund: 'nicht-aufloesbar' }
  }
}

/**
 * Standard-Umkreis, wenn der SV noch kein Paket-Gebiet hat.
 *
 * 25 km, gleichgezogen mit dem Freigabe-Guard: der heilt eine fehlende Isochrone spaeter mit
 * genau diesem Wert, und zwei verschiedene Standardradien fuer denselben SV waeren eine
 * Falle, keine Wahl.
 */
export const STANDARD_UMKREIS_KM = 25

/**
 * Legt das Einsatzgebiet (Isochrone) an, sobald Koordinaten feststehen.
 *
 * Ohne Isochrone deckt das Dispatch-Matching keinen Schadenort ab — der SV ist angelegt und
 * trifft trotzdem 0 Leads. Bewusst best-effort: ein fehlgeschlagener Mapbox-Aufruf darf keine
 * Registrierung zuruecknehmen; der Freigabe-Guard berechnet sie beim Freischalten nach.
 *
 * Liefert true, wenn ein Polygon gespeichert wurde.
 */
export async function stelleIsochroneSicher(
  db: DbClient,
  svId: string,
  lat: number,
  lng: number,
  radiusKm: number = STANDARD_UMKREIS_KM,
): Promise<boolean> {
  try {
    const { calculateIsochrone } = await import('@/lib/isochrone/calculate-isochrone')
    const polygon = await calculateIsochrone(lat, lng, radiusKm)
    if (!polygon || polygon.length === 0) return false
    const { error } = await db
      .from('sachverstaendige')
      .update({ isochrone_polygon: polygon })
      .eq('id', svId)
    if (error) {
      console.error('[standort-geocoding] Isochrone konnte nicht gespeichert werden:', error.message)
      return false
    }
    return true
  } catch (err) {
    console.error('[standort-geocoding] Isochrone-Berechnung fehlgeschlagen (non-blocking):', err)
    return false
  }
}

/**
 * Der Supabase-Client ohne Schema-Generic.
 *
 * Bewusst nicht als struktureller Typ ("hat .from('plz_geo').select()…") beschrieben: gegen
 * den vollen generischen Client laeuft TypeScript dabei in TS2589 ("type instantiation is
 * excessively deep") — beim ersten Entwurf genau hier passiert, im Buero-Onboarding. Gleiche
 * Form wie in src/lib/sv/queries.ts. Beide Aufrufer-Arten (Admin- und RLS-Client) passen.
 */
type DbClient = SupabaseClient

/**
 * Produktions-Ermittler. `db` liefert nur den PLZ-Mittelpunkt; das Geocoding laeuft ueber
 * Mapbox und wird erst beim Aufruf geladen (der Helfer bleibt so ohne Netz importierbar).
 */
export async function ermittleStandort(
  db: DbClient,
  eingabe: StandortEingabe,
): Promise<StandortErgebnis> {
  return macheStandortErmittler({
    geocode: async (adresse) => {
      const { geocodeAdresse } = await import('@/lib/mapbox/geocode')
      const r = await geocodeAdresse(adresse)
      return r ? { lat: r.lat, lng: r.lng } : null
    },
    plzMittelpunkt: async (plz) => {
      const { data } = await db.from('plz_geo').select('lat, lng').eq('plz', plz).maybeSingle()
      if (!data) return null
      const lat = Number(data.lat)
      const lng = Number(data.lng)
      return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
    },
  })(eingabe)
}
