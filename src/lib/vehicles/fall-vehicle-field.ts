// CMM-49 Vehicle-Tier: Routing der Fallakte-Fahrzeug-Stammdatenfelder auf die vehicles-SSoT.
//
// Hintergrund: faelle ist gedroppt. Die Fallakte liest die Fahrzeug-Stammdaten via
// v_claim_full aus dem veh-LATERAL (die claim-verknuepfte vehicles-Row). Ein Inline-Edit
// dieser Felder lief bisher in den faelle-Residual-Write (reader-frei -> versickerte).
// updateFallField routet sie jetzt auf vehicles (Resolver = ensureVehicleForClaim ueber
// claims.vehicle_id). Diese Map/Transform ist eine reine Funktion (kein Server-Dep), damit
// sie testbar ist und NICHT aus der 'use server'-Action exportiert werden muss.
//
// Read-Source je Feld (v_claim_full, DB-verifiziert 2026-06-22):
//   kennzeichen        = veh.kennzeichen_aktuell
//   fahrzeug_hersteller= NULLIF(veh.hersteller,'Unbekannt')
//   fahrzeug_modell    = veh.modell_haupttyp
//   fahrzeug_typ       = veh.bauart
//   fahrzeug_farbe     = veh.farbe_klartext
//   lackfarbe_code     = veh.farbcode
//   fin_vin            = veh.fin
//   kilometerstand     = veh.aktueller_kilometerstand
//   erstzulassung      = veh.erstzulassung
//   fahrzeug_baujahr   = EXTRACT(year FROM veh.baujahr_monat)::int   <- Transform unten
//
// NICHT enthalten (bewusst deferred, eigener Schritt):
//   hsn/tsn            -> vehicles.hsn/tsn existiert, wird aber NICHT von v_claim_full
//                         exponiert (Read-Source unbestaetigt) -> erst nach Reader-Klaerung.
//   ist_fahrzeughalter -> Party-Flag (v_claim_full hat zwei Quellen kunde_p./kcp.) -> mehrdeutig.
//   vorschaden_anzahl  -> vv.anzahl-Aggregat (vehicle_vorschaeden) -> nicht direkt schreibbar.
//   gegner_name        -> COALESCE(firma.name, vorname||' '||nachname) -> Name-Split noetig.

export const FALL_VEHICLE_COL: Record<string, string> = {
  fahrzeug_hersteller: 'hersteller',
  fahrzeug_modell: 'modell_haupttyp',
  fahrzeug_typ: 'bauart',
  fahrzeug_farbe: 'farbe_klartext',
  lackfarbe_code: 'farbcode',
  kennzeichen: 'kennzeichen_aktuell',
  fin_vin: 'fin',
  kilometerstand: 'aktueller_kilometerstand',
  erstzulassung: 'erstzulassung',
  fahrzeug_baujahr: 'baujahr_monat',
}

/**
 * Transformiert den normalisierten UI-Wert in den vehicles-Spaltenwert.
 * - fahrzeug_baujahr: int Jahr -> baujahr_monat date "<jahr>-01-01" (v_claim_full liest EXTRACT(year)).
 * - kilometerstand: -> nicht-negative ganze Zahl.
 * - sonst: durchreichen (Postgres validiert date/text; null = explizites Loeschen).
 */
export function fallVehicleWriteValue(
  field: string,
  normalized: unknown,
): { ok: true; value: unknown } | { ok: false; error: string } {
  if (normalized == null) return { ok: true, value: null }

  if (field === 'fahrzeug_baujahr') {
    const yr = typeof normalized === 'number' ? normalized : parseInt(String(normalized), 10)
    if (!Number.isInteger(yr) || yr < 1900 || yr > 2100) {
      return { ok: false, error: 'Baujahr muss ein Jahr zwischen 1900 und 2100 sein.' }
    }
    return { ok: true, value: `${yr}-01-01` }
  }

  if (field === 'kilometerstand') {
    const km = typeof normalized === 'number' ? normalized : parseInt(String(normalized), 10)
    if (!Number.isInteger(km) || km < 0) {
      return { ok: false, error: 'Kilometerstand muss eine nicht-negative ganze Zahl sein.' }
    }
    return { ok: true, value: km }
  }

  return { ok: true, value: normalized }
}
