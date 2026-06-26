// Pure Whitelist-Konstanten fuers SV-Basic-Onboarding-Save. KEINE 'use server'-Direktive hier:
// Konstanten duerfen NICHT aus einem 'use server'-File exportiert werden (sonst Build-Fehler
// "Server Actions must be async functions" — AAR-664 / use_server_konstanten).
//
// Genutzt von den Onboarding-Table-Handlern (sachverstaendige-handler / profiles-handler) als
// Mass-Assignment-Guard. Die fruehere filterAufWhitelist-Funktion war 0-Caller (Kanonizitaets-
// Audit 25.06.) — die Handler nutzen buildAllowlistedUpdates + diese Konstanten.

// NUR diese Spalten darf der SV uebers Onboarding setzen. NIE paket/verifiziert/
// verifizierung_status/ist_aktiv/portal_zugang_freigeschaltet/onboarding_status/rolle
// (Mass-Assignment-Guard). fachschwerpunkte existiert NICHT auf sachverstaendige.
export const SV_WHITELIST = new Set(['bvsk_mitgliedsnummer', 'ihk_zertifikat_nummer', 'oebuv_bestellungsnummer',
  'standort_adresse', 'standort_plz', 'standort_lat', 'standort_lng', 'standort_place_id', 'paket_umkreis_km'])
export const PROFILE_WHITELIST = new Set(['profilbeschreibung', 'anzeigename', 'telefon'])
