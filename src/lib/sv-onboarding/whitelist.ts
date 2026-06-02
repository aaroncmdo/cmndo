// Pure Whitelist-Helper fuers SV-Basic-Onboarding-Save. KEINE 'use server'-Direktive hier:
// Konstanten/Sync-Funktionen duerfen NICHT aus einem 'use server'-File exportiert werden
// (sonst Build-Fehler "Server Actions must be async functions" — AAR-664 / use_server_konstanten).

// NUR diese Spalten darf der SV uebers Onboarding setzen. NIE paket/verifiziert/
// verifizierung_status/ist_aktiv/portal_zugang_freigeschaltet/onboarding_status/rolle
// (Mass-Assignment-Guard). fachschwerpunkte existiert NICHT auf sachverstaendige.
export const SV_WHITELIST = new Set(['bvsk_mitgliedsnummer', 'ihk_zertifikat_nummer', 'oebuv_bestellungsnummer',
  'standort_adresse', 'standort_plz', 'standort_lat', 'standort_lng', 'standort_place_id', 'paket_umkreis_km'])
export const PROFILE_WHITELIST = new Set(['profilbeschreibung', 'anzeigename', 'telefon'])

export function filterAufWhitelist(
  items: Array<{ tabelle: string; spalte: string; value: unknown }>,
): { sv: Record<string, unknown>; profile: Record<string, unknown>; dropped: string[] } {
  const sv: Record<string, unknown> = {}, profile: Record<string, unknown> = {}, dropped: string[] = []
  for (const it of items) {
    if (it.tabelle === 'sachverstaendige' && SV_WHITELIST.has(it.spalte)) sv[it.spalte] = it.value
    else if (it.tabelle === 'profiles' && PROFILE_WHITELIST.has(it.spalte)) profile[it.spalte] = it.value
    else dropped.push(`${it.tabelle}.${it.spalte}`)
  }
  return { sv, profile, dropped }
}
