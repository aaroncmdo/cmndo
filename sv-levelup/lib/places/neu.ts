import type { AdapterOpts, Betrieb, PlacesAdapter, Umkreis } from './adapter'

/**
 * Places API (New) — `places.googleapis.com`.
 *
 * Noch nicht gebaut, weil der vorhandene Key sie nicht darf: die Cloud Console
 * fuehrt "Places API" und "Places API (New)" als ZWEI getrennte
 * Restriction-Eintraege, und nur die alte ist freigegeben (gemessen 18.08.2026,
 * Projekt 67468726375 → 403 API_KEY_SERVICE_BLOCKED).
 *
 * ⚠ Bewusst ein sprechender Fehlschlag statt eines stillen Rueckfalls auf
 * Legacy: Wer `LEVELUP_PLACES_API=neu` setzt, will New — ein heimlicher
 * Rueckfall wuerde die Umstellung als erfolgreich erscheinen lassen und erst
 * in der Rechnung auffallen.
 *
 * Zum Ausbauen (nach A-1): `searchText` und `searchNearby` als POST mit
 * `X-Goog-FieldMask`. ⚠ Die FieldMask bestimmt die PREISSTUFE — `websiteUri`,
 * `rating` und `userRatingCount` sind **Enterprise** ($35/1000, nur 1.000
 * gratis/Monat), nicht Pro. Discovery ohne diese drei Felder bleibt Pro
 * (5.000 gratis). Siehe Design-Spec §7.1/§7.2.
 */
export function erzeugeNeu(_apiKey: string, _opts: AdapterOpts = {}): PlacesAdapter {
  const nichtBereit = (): never => {
    throw new Error(
      'Places API (New) ist fuer diesen Key gesperrt (A-1). ' +
      'Restriction um "Places API (New)" erweitern oder LEVELUP_PLACES_API=legacy setzen.',
    )
  }

  return {
    async suchText(_frage: string, _umkreis: Umkreis): Promise<Betrieb[]> { return nichtBereit() },
    async suchUmkreis(_stichwort: string, _umkreis: Umkreis): Promise<Betrieb[]> { return nichtBereit() },
    async details(_placeId: string): Promise<Betrieb | null> { return nichtBereit() },
  }
}
