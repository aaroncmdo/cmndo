// Pure Kern des Werkstatt-Embed-Finders (client-safe, kein Server-Import):
// Write-Time-Test-Guard + Bau des createLead-`extra`-Objekts. Die Zuweisung nutzt den
// kanonischen buildZuweisungPatch (Reparateur-Slot, quelle='embed') — NIE werkstatt_id.
import { istInterneEmail } from '@/lib/testdaten/interne-identitaet'
import { buildZuweisungPatch } from '@/lib/werkstatt/vermittlung-core'
import type { KaskoTarifAuswahl, WbErgebnis } from '@/lib/kasko-wb/types'

export type WerkstattFinderLeadInput = {
  werkstattId: string | null
  werkstattEmail: string | null
  kundeEmail: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
  // Phase 3: db-driven Übergabe der Wizard-Felder (alle Spalten prod-verifiziert, kein DDL).
  hersteller?: string | null
  fahrzeugklasse?: string | null
  gewerbe?: boolean | null
  modell?: string | null
  beschreibung?: string | null
  // F1 (Entry-Point-Audit 24.07.) + Unverschuldet-Option (Aaron 04.08.): Schuldfrage-Wahl -> Lead-Szenario.
  // 'gegner' (unverschuldet) -> haftpflicht; 'eigenverantwortung' + eigeneVersicherung -> kasko/selbstzahler.
  schuldfrage?: 'eigenverantwortung' | 'gegner' | null
  eigeneVersicherung?: 'ja' | 'nein' | null
  /** Kasko-WB Phase 1: Antwort der Tariffrage (nur bei eigeneVersicherung='ja'). */
  kaskoWb?: (KaskoTarifAuswahl & WbErgebnis) | null
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
    // Phase 3: Contract-Felder (fließen via convert-lead-to-claim in Claim/Feststellung/Firma).
    fahrzeug_hersteller: input.hersteller?.trim() || null,
    fahrzeugklasse: input.fahrzeugklasse ?? null,
    fahrzeug_modell: input.modell?.trim() || null,
    gewerbe_flag: input.gewerbe ?? false,
    fahrzeugschaden_beschreibung: input.beschreibung?.trim() || null,
  }
  // Schuldfrage-Wahl -> Lead-Szenario-Felder. Nur setzen wenn gewaehlt (sonst schuldfrage null ->
  // /flow-Quali-Fallback fuer Alt-Aufrufer/Re-Entry).
  //   'gegner' (unverschuldet): schuldfrage allein reicht (haftpflicht-Szenario matcht OHNE
  //     eigene_versicherung; der Gegner zahlt) -> eigene_versicherung NICHT setzen.
  //   'eigenverantwortung': eigene_versicherung MUSS mit (sonst still-disqualifiziert, quali-gate.ts).
  if (input.schuldfrage === 'gegner') {
    extra.schuldfrage = 'gegner'
  } else if (input.schuldfrage && input.eigeneVersicherung) {
    extra.schuldfrage = input.schuldfrage
    extra.eigene_versicherung = input.eigeneVersicherung
  }
  const gebunden = input.kaskoWb?.freieWerkstattwahl === false
  if (input.kaskoWb) {
    extra.eigene_versicherung_marke_id = input.kaskoWb.markeId
    extra.eigene_versicherung_name = input.kaskoWb.markeName
    extra.eigene_kasko_tarif_id = input.kaskoWb.tarifId
    extra.eigene_kasko_tarif_name = input.kaskoWb.tarifName
    extra.werkstattbindung_quelle = input.kaskoWb.quelle
    if (input.kaskoWb.freieWerkstattwahl !== null) extra.freie_werkstattwahl = input.kaskoWb.freieWerkstattwahl
  }
  // Umgehung (a) aus dem Scan: gebundener Kasko-Kunde bekommt KEINE Werkstatt zugewiesen.
  if (!gebunden && input.werkstattId && darfWerkstattZuweisen(input.kundeEmail, input.werkstattEmail)) {
    Object.assign(extra, buildZuweisungPatch(input.werkstattId, null, 'embed'), { reparaturwunsch: 'reparatur' })
  }
  return extra
}
