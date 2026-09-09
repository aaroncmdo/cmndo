// Die Fahrzeug-Identifizierungsnummer auf das Fahrzeug schreiben — ein Weg für alle Rollen.
//
// Aaron 09.09.2026 auf die Frage, wohin eine vom Kunden korrigierte Nummer gehört:
// „Gutachten und Fahrzeug."
//
// Warum das mehr ist als eine Spalte: Gutachten-Briefing, Sachverständigen-Auftrag und die
// Fahrzeugansicht des Kunden lesen alle über `v_claim_full` aus `vehicles`. Fehlt die Nummer
// dort, zeigt die Fallseite des Sachverständigen die Karte „FIN nachtragen" — obwohl der
// Kunde sie längst eingetragen hat. Der Lead allein reicht also nicht.
//
// Der Kern stand am 09.09.2026 dreimal fast wortgleich im Code (Fallakte `saveFinVin`,
// SV-Portal `saveFinVinGutachter`, OCR-Route) und fehlte an zwei Stellen ganz (Korrektur
// durch den Kunden, Stammdaten-Save im Dispatch). Er liegt jetzt hier; die Autorisierung
// bleibt beim Aufrufer, weil sie sich je Rolle unterscheidet.
//
// ⚠ Kein direktes `UPDATE vehicles SET fin = …`. Die Spalte trägt UNIQUE und
// CHECK(length = 17); ein blindes Update kollidiert oder bricht — und weil Supabase-Writes
// nicht werfen, still. Der getragene Weg ist `ensureVehicleFromFin`: es validiert das Format
// vorab, macht den Upsert über die RPC und absorbiert einen vorhandenen nummernlosen
// Platzhalter (geprüft in der Datenbank, nicht nur im Aufrufer).

import type { SupabaseClient } from '@supabase/supabase-js'
import { ensureVehicleFromFin, VIN_REGEX, istPlausibleFin } from './ensure-vehicle'

/** Was mit einer eingegebenen Nummer geschehen soll. Pure Entscheidung, ohne Datenbank. */
export type FinPlan =
  | { aktion: 'nichts'; grund: 'leer' | 'format' | 'identisch' }
  | { aktion: 'schreiben'; fin: string; absorbierePlatzhalter: string | null }

/**
 * Entscheidet, was mit der eingegebenen Nummer zu tun ist.
 *
 * Drei Fälle, die auseinandergehalten werden müssen:
 *  - Das Fahrzeug hat noch keine Nummer → schreiben und den Platzhalter absorbieren.
 *    Das ist der Normalfall: die Fahrzeugzeile entsteht bei der Fall-Anlage ohne Nummer.
 *  - Das Fahrzeug hat dieselbe Nummer → nichts zu tun.
 *  - Das Fahrzeug hat eine ANDERE Nummer → das ist ein Identitätswechsel, kein Nachtrag.
 *    Dann wird die Fallakte auf die andere Fahrzeugzeile gehängt, aber **nichts absorbiert**:
 *    ein Fahrzeug mit eigener Nummer ist kein Platzhalter und darf nicht verschwinden.
 */
export function planeFinSchreiben(
  eingabe: string | null | undefined,
  aktuelleFahrzeugNummer: string | null | undefined,
  aktuelleFahrzeugId: string | null | undefined,
): FinPlan {
  const fin = (eingabe ?? '').trim().toUpperCase()
  if (!fin) return { aktion: 'nichts', grund: 'leer' }
  // Dieselbe Prüfung, die auch `ensureVehicleFromFin` anlegt — sonst plant diese Funktion
  // ein Schreiben, das der Helfer gleich darauf ablehnt. Die Plausibilität hält Wörter
  // draußen, die zufällig siebzehn erlaubte Zeichen haben („MAHZAWACKFAHRZEUG").
  if (!VIN_REGEX.test(fin) || !istPlausibleFin(fin)) return { aktion: 'nichts', grund: 'format' }

  const vorhanden = (aktuelleFahrzeugNummer ?? '').trim().toUpperCase()
  if (vorhanden === fin) return { aktion: 'nichts', grund: 'identisch' }

  return {
    aktion: 'schreiben',
    fin,
    // Nur ein Fahrzeug OHNE eigene Nummer ist ein Platzhalter, der aufgehen darf.
    absorbierePlatzhalter: vorhanden ? null : (aktuelleFahrzeugId ?? null),
  }
}

export type FinSchreibenErgebnis =
  | { ok: true; vehicleId: string; geaendert: true }
  | { ok: true; geaendert: false; grund: 'leer' | 'format' | 'identisch' | 'kein_fahrzeug' }
  | { ok: false; error: string }

/**
 * Schreibt die Nummer auf das Fahrzeug des Falls und hängt die Fallakte darauf.
 *
 * Der Aufrufer hat bereits autorisiert — hier wird nur noch geschrieben. `db` ist ein
 * service_role-Client (die RPC ist SECURITY DEFINER, `vehicles` ist nicht kundenschreibbar).
 *
 * Liefert immer ein Result-Object und wirft nie: ein misslungener Nachtrag darf die
 * übrigen Korrekturen desselben Speichervorgangs nicht mitreißen.
 */
export async function schreibeFinAufFahrzeug(params: {
  /** Der Fall, dessen Fahrzeug die Nummer bekommt. */
  claimId: string
  fin: string | null | undefined
  /** Woher die Nummer stammt — landet in `vehicles.fin_quelle`. */
  quelle: string
  db: SupabaseClient
}): Promise<FinSchreibenErgebnis> {
  try {
    const { data: claim, error: claimFehler } = await params.db
      .from('claims')
      .select('vehicle_id')
      .eq('id', params.claimId)
      .maybeSingle()
    if (claimFehler) return { ok: false, error: claimFehler.message }

    const altesFahrzeug = (claim?.vehicle_id as string | null) ?? null

    let alteNummer: string | null = null
    if (altesFahrzeug) {
      const { data: fahrzeug } = await params.db
        .from('vehicles').select('fin').eq('id', altesFahrzeug).maybeSingle()
      alteNummer = (fahrzeug?.fin as string | null) ?? null
    }

    const plan = planeFinSchreiben(params.fin, alteNummer, altesFahrzeug)
    if (plan.aktion === 'nichts') return { ok: true, geaendert: false, grund: plan.grund }

    // Den bekannten Fahrzeug-Stand mitgeben, damit die neue Zeile nicht ärmer ist als die
    // alte. Nur gesetzte Felder werden übernommen (kein Überschreiben mit Leere).
    const { data: stand } = await params.db
      .from('v_claim_full')
      .select('kennzeichen, fahrzeug_hersteller, fahrzeug_modell, hsn, tsn, kilometerstand, fahrzeug_typ, fahrzeug_baujahr, fahrzeug_farbe, lackfarbe_code, erstzulassung, fahrzeug_ausstattung, kennzeichen_buchstaben')
      .eq('id', params.claimId)
      .maybeSingle()
    const s = (stand as Record<string, unknown> | null) ?? {}

    const fahrzeug = await ensureVehicleFromFin({
      fin: plan.fin,
      snapshot: {
        kennzeichen: (s.kennzeichen as string | null) ?? null,
        hersteller: (s.fahrzeug_hersteller as string | null) ?? null,
        modell: (s.fahrzeug_modell as string | null) ?? null,
        hsn: (s.hsn as string | null) ?? null,
        tsn: (s.tsn as string | null) ?? null,
        kilometerstand: (s.kilometerstand as number | null) ?? null,
        kennzeichenBuchstaben: (s.kennzeichen_buchstaben as string | null) ?? null,
        farbe: (s.fahrzeug_farbe as string | null) ?? null,
        farbcode: (s.lackfarbe_code as string | null) ?? null,
        bauart: (s.fahrzeug_typ as string | null) ?? null,
        baujahr: (s.fahrzeug_baujahr as number | null) ?? null,
        erstzulassung: (s.erstzulassung as string | null) ?? null,
        ausstattung: s.fahrzeug_ausstattung ?? null,
        finQuelle: params.quelle,
        finExtrahiertAm: new Date().toISOString(),
      },
      db: params.db,
      supersedesVehicleId: plan.absorbierePlatzhalter ?? undefined,
    })
    if (!fahrzeug.ok) return { ok: false, error: fahrzeug.error }

    // Die Fallakte auf die Fahrzeugzeile hängen. Bei einer Absorption hat
    // merge_stub_vehicle das schon getan; der Schreibvorgang ist idempotent.
    if (fahrzeug.vehicleId !== altesFahrzeug) {
      const { error: hängFehler } = await params.db
        .from('claims').update({ vehicle_id: fahrzeug.vehicleId }).eq('id', params.claimId)
      // Ohne diese Verknüpfung stünde die Nummer an einer Zeile, die niemand liest —
      // Gutachten und Sachverständigen-Auftrag sähen weiterhin nichts.
      if (hängFehler) return { ok: false, error: hängFehler.message }
    }

    return { ok: true, vehicleId: fahrzeug.vehicleId, geaendert: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
