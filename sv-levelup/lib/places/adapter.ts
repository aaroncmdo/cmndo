/**
 * Der gemeinsame Vertrag fuer Google Places.
 *
 * Warum ein Adapter (Design-Spec §7.6): Die **Legacy**-API laeuft heute mit dem
 * vorhandenen Key, die **New**-API ist per Key-Restriction gesperrt (A-1).
 * Legacy ist fuer neue Kunden geschlossen und damit ein Auslaufpfad — New ist
 * die Variante, die Google weiterentwickelt. Beide Wahrheiten gleichzeitig
 * tragbar zu machen, geht nur so: die Module kennen nur diesen Vertrag, der
 * Wechsel bleibt ein Modultausch statt einer Migration.
 *
 * Die Unterschiede, die der Adapter verbirgt:
 *   - Legacy kennt Nearby Search mit Freitext-`keyword`; New erlaubt dort nur
 *     `includedTypes`, und fuer "Kfz-Sachverstaendiger" existiert kein Typ.
 *   - Legacy liefert bis 60 Treffer ueber `next_page_token`, New bei Nearby 20
 *     ohne Paging.
 *   - Die Preisstufen heissen verschieden (Basic/Contact/Atmosphere vs.
 *     Essentials/Pro/Enterprise) und haben eigene Gratis-Kontingente.
 */

export type Betrieb = {
  placeId: string
  name: string
  adresse: string | null
  lat: number
  lng: number
  website: string | null
  bewertung: number | null
  bewertungen: number | null
}

/**
 * Was das Google-Unternehmensprofil ueber die Places-API hergibt.
 *
 * ⚠ Was es NICHT hergibt: die vom Inhaber gewaehlte Kategorie. Am 19.08. ueber
 * acht Muensteraner Betriebe gemessen — ALLE acht tragen dieselben `types`
 * (`establishment|finance|point_of_interest`). Das Mockup verlangt „Kategorie
 * steht auf Ingenieurbuero statt Gutachter"; diese Angabe lebt im
 * Unternehmensprofil, nicht in der API. Was Places `types` nennt, ist Googles
 * eigene grobe Einordnung. Ein Kriterium darauf zu bauen hiesse, allen
 * dieselbe Note zu geben und es Messung zu nennen.
 */
export type Profil = Betrieb & {
  /** ⚠ Places liefert hoechstens 10 — der Wert ist eine UNTERGRENZE, keine Zahl. */
  fotos: number
  oeffnungszeiten: boolean
  telefon: string | null
  betriebsstatus: string | null
}

export type Umkreis = { lat: number; lng: number; km: number }

export type PlacesAdapter = {
  /** Freitextsuche mit Ortsbezug — fuer `wett`, `markt`. */
  suchText(frage: string, umkreis: Umkreis): Promise<Betrieb[]>
  /** Umkreissuche mit Stichwort — fuer `zuweiser` (Werkstaetten, Anwaelte). */
  suchUmkreis(stichwort: string, umkreis: Umkreis): Promise<Betrieb[]>
  /** Einzelabruf der Grunddaten. */
  details(placeId: string): Promise<Betrieb | null>
  /** Profilmerkmale des geprueften Betriebs — fuer `gbp`. */
  profil(placeId: string): Promise<Profil | null>
  /**
   * NUR die Website eines Betriebs.
   *
   * ⚠ Bewusst ein eigener Aufruf mit `fields=website` statt `details()`: die
   * Preisstufe richtet sich nach den angefragten Feldern. Wer Grunddaten
   * mitbestellt, die er wegwirft, zahlt dafuer.
   *
   * Der Grund fuer diesen Weg: Die Textsuche liefert bei Legacy KEINE Website,
   * und das Raten aus dem Firmennamen scheitert bei den entdeckten Betrieben
   * fast vollstaendig — Google fuehrt sie unter Beschreibungen statt
   * Firmennamen („Kfz Gutachter Herne / Ingenieurbüro für Fahrzeugtechnik").
   * Gemessen am 20.08.: 0 von 10 belastbare Websites aus dem Raten.
   */
  websiteVon(placeId: string): Promise<string | null>
}

export type AdapterOpts = {
  fetchImpl?: typeof fetch
  warte?: (ms: number) => Promise<void>
}

/**
 * ⚠ Ein API-Fehler darf NIE als leere Trefferliste durchgehen.
 *
 * "0 Wettbewerber im Umkreis" ist ein Befund, den es fast nie gibt — als
 * Ergebnis eines gesperrten Keys waere er eine plausible Luege im Befund des
 * Kunden. Deshalb wirft der Adapter, und die Messmaschine macht daraus eine
 * Fehlstelle mit Grund (R-B).
 */
export class PlacesFehler extends Error {
  constructor(public status: string, meldung?: string) {
    super(`Places-Fehler ${status}${meldung ? `: ${meldung}` : ''}`)
    this.name = 'PlacesFehler'
  }
}
