// Pure Kern des Werkstatt-Embed-Finders (client-safe, kein Server-Import):
// Write-Time-Test-Guard + Bau des createLead-`extra`-Objekts. Die Zuweisung nutzt den
// kanonischen buildZuweisungPatch (Reparateur-Slot, quelle='embed') — NIE werkstatt_id.
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'
import { buildZuweisungPatch } from '@/lib/werkstatt/vermittlung-core'

export type WerkstattFinderLeadInput = {
  werkstattId: string | null
  werkstattEmail: string | null
  kundeEmail: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
}

/**
 * Darf die (gewaehlte) Werkstatt dem Kunden zugewiesen werden? Nur wenn beide dieselbe
 * "Test-Ness" haben — so erreicht ein Test-Claim NIE eine echte Werkstatt und umgekehrt
 * (analog A-Trigger, hier am Write-Pfad des Embed-Finders).
 */
export function darfWerkstattZuweisen(
  kundeEmail: string | null | undefined,
  werkstattEmail: string | null | undefined,
): boolean {
  return istInterneEmail(kundeEmail) === istInterneEmail(werkstattEmail)
}

/**
 * Baut das `extra`-Objekt fuer createLead. Weist die Werkstatt als Reparateur zu
 * (buildZuweisungPatch + reparaturwunsch='reparatur') NUR wenn eine gewaehlt wurde UND
 * der Test-Guard passt. Sonst (Supply-Gate ODER Guard-Block): nur Geo, keine Werkstatt.
 */
export function buildWerkstattFinderLeadExtra(input: WerkstattFinderLeadInput): Record<string, unknown> {
  const extra: Record<string, unknown> = {
    fahrzeug_standort_lat: input.lat ?? null,
    fahrzeug_standort_lng: input.lng ?? null,
    fahrzeug_standort_adresse: input.ort ?? null,
  }
  if (input.werkstattId && darfWerkstattZuweisen(input.kundeEmail, input.werkstattEmail)) {
    Object.assign(extra, buildZuweisungPatch(input.werkstattId, null, 'embed'), {
      reparaturwunsch: 'reparatur',
    })
  }
  return extra
}
