// CMM-49 Fallakte-Stammdaten Write-Coercion — reine, getestete Helfer fuer den
// generischen Inline-Editor (faelle/[id]/_actions/stammdaten.ts:updateFallField).
// KEIN 'use server' (pure Logik) -> unit-testbar (analog lib/vehicles/fall-vehicle-field.ts).

/**
 * Ja/Nein-Felder der Fallakte werden als Text "Ja"/"Nein" angezeigt + editiert
 * (InlineEditField sendet den rohen draft-String; FallContext.updateField reicht
 * ihn ungecoerced durch). Ihre Zielspalte ist aber boolean:
 *   - claim_parties.ist_halter           (ist_fahrzeughalter)
 *   - claims.gegner_bekannt / fahrerflucht / auslandskennzeichen /
 *     vorsteuerabzugsberechtigt / hat_vorschaeden
 * Postgres castet "Ja"/"Nein" NICHT nach boolean (22P02 invalid input syntax) ->
 * jeder Edit dieser 6 Felder schlug serverseitig fehl. Hier zentral coercen.
 *
 * Akzeptiert deutsche + englische Gross/Klein-Varianten; leer -> null (explizites
 * Loeschen); unbekannt -> Fehler (statt still null in die boolean-Spalte zu schreiben).
 */
export function coerceJaNein(
  value: unknown,
): { ok: true; value: boolean | null } | { ok: false; error: string } {
  if (value === null || value === undefined) return { ok: true, value: null }
  if (typeof value === 'boolean') return { ok: true, value }
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase()
    if (s === '') return { ok: true, value: null }
    if (['ja', 'j', 'true', 'wahr', '1', 'yes', 'y'].includes(s)) return { ok: true, value: true }
    if (['nein', 'n', 'false', 'falsch', '0', 'no'].includes(s)) return { ok: true, value: false }
    return { ok: false, error: `Ungueltiger Ja/Nein-Wert: "${value}". Bitte "Ja" oder "Nein".` }
  }
  return { ok: false, error: 'Ungueltiger Ja/Nein-Wert.' }
}

/**
 * Zerlegt einen Freitext-Personennamen ("gegner_name") in vorname/nachname fuer die
 * personen-Entitaet. Der Reader liest gpp.vorname || ' ' || gpp.nachname zurueck
 * (v_claim_full / v_faelle_mit_aktuellem_termin), daher ist die Heuristik display-
 * roundtrip-sicher: letztes Token = nachname, Rest = vorname; Einzeltoken = nur
 * nachname. Mehrteilige Nachnamen ("von der Heide") werden imperfekt gesplittet —
 * fuer ein Freitext-Gegnerfeld akzeptabel (kein strukturierter Konsument der
 * gegner-vorname/nachname-Aufteilung).
 */
export function splitPersonName(
  full: string | null | undefined,
): { vorname: string | null; nachname: string | null } {
  if (!full || !full.trim()) return { vorname: null, nachname: null }
  const parts = full.trim().split(/\s+/)
  if (parts.length === 1) return { vorname: null, nachname: parts[0] }
  return { vorname: parts.slice(0, -1).join(' '), nachname: parts[parts.length - 1] }
}
