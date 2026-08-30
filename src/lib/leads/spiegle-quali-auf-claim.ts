// Der Self-Service-Flow (/flow/[token]) erhebt die Quali-Antworten des Kunden und schreibt
// sie in die LEAD-Zeile. Existiert zu diesem Lead bereits ein Claim — weil die Konversion
// VOR der Beantwortung lief — kommt der Wert dort nie an. Und genau den Claim lesen alle
// Anzeigen: kunde-claim-view (GeldZone), werkstatt/queries (Auftrag), gutachter/fall.
//
// Der Kunde beantwortet also die Frage, sieht seine Antwort bestaetigt, und Werkstatt wie
// Sachverstaendiger sehen weiterhin "keine Angabe". Nirgends steht ein Fehler.
//
// Prod-Messung 30.08.2026 (49 Claims mit Lead): 21 Zeilen ueber 5 Felder, bei denen der Lead
// einen Wert traegt und der Claim NULL ist — schuldfrage 11, eigene_versicherung 5,
// reparaturwunsch 2, freie_werkstattwahl 2, abrechnungsweg 1. **0 divergent**: es gibt keinen
// Fall, in dem beide gefuellt und verschieden sind. Ein Nachzug ueberschreibt daher nie eine
// bewusst abweichende Claim-Entscheidung — und dieser Helper setzt ohnehin nur leere Felder.
//
// Die beiden Faelle, die es sichtbar machten, zeigen beide Zeitmuster:
//   CLM-2026-00950  Claim 22.07. 17:50  ->  Lead-Wert 24.07. 13:59  (zwei Tage spaeter)
//   CLM-2026-01078  Claim 30.07. 13:37  ->  Lead-Wert 30.07. 13:41  (vier Minuten spaeter)
//
// Abgrenzung: convert-lead-to-claim.ts kopiert diese Felder bereits bei der Konversion
// korrekt (Lead -> Claim, Zeile 544). Dieser Helper deckt die andere Richtung der Zeitachse
// ab — Antworten, die NACH der Konversion eintreffen. Beide Wege zusammen schliessen die Luecke.

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Die Quali-Felder, die der Flow in den Lead schreibt UND die es auf `claims` gibt.
 * Verifiziert 30.08. gegen information_schema: gleicher Datentyp auf beiden Tabellen
 * (text bzw. boolean), und fuer `abrechnungsweg`/`reparaturwunsch` byte-identische
 * CHECK-Constraints — ein Nachzug kann dort nicht still rejected werden.
 * `notiz` ist bewusst NICHT dabei: die Spalte existiert auf `claims` gar nicht.
 */
export const QUALI_FELDER = [
  'schuldfrage',
  'abrechnungsweg',
  'reparaturwunsch',
  'eigene_versicherung',
  'freie_werkstattwahl',
] as const

export type QualiFeld = (typeof QUALI_FELDER)[number]

export type QualiWerte = Partial<Record<QualiFeld, unknown>>

/**
 * Spiegelt die im Lead gesetzten Quali-Antworten auf den zugehoerigen Claim — aber nur in
 * Felder, die dort noch leer sind. Ein am Claim bereits gesetzter Wert bleibt unangetastet:
 * er kann von einem Dispatcher/SV bewusst korrigiert worden sein, und der Kunde-Flow ist
 * nicht die Instanz, die eine solche Korrektur ueberstimmt.
 *
 * Gibt es zum Lead (noch) keinen Claim, ist der Aufruf ein No-op — der Normalfall im
 * `lead-first`-Modus, in dem der Claim erst spaeter entsteht. Dort kopiert die Konversion.
 *
 * Non-critical by design: der Lead-Update des Callers ist bereits durch, die Antwort des
 * Kunden ist gespeichert. Ein Fehler beim Spiegeln darf sie nicht zurueckdrehen — deshalb
 * liefert der Helper ein Result-Object und wirft nie.
 */
export async function spiegleQualiAufClaim(
  admin: SupabaseClient,
  leadId: string,
  werte: QualiWerte,
): Promise<{ ok: boolean; error?: string; gespiegelt: QualiFeld[] }> {
  // Nur Felder betrachten, die der Caller tatsaechlich gesetzt hat. `undefined` heisst
  // "nicht erhoben"; `null` heisst "bewusst geleert" und wird ebenfalls nicht gespiegelt
  // (ein Nachzug von NULL auf NULL waere ohnehin wirkungslos).
  const kandidaten = QUALI_FELDER.filter((f) => werte[f] !== undefined && werte[f] !== null)
  if (kandidaten.length === 0) return { ok: true, gespiegelt: [] }

  const { data: claim, error: leseErr } = await admin
    .from('claims')
    .select(`id, ${QUALI_FELDER.join(', ')}`)
    .eq('lead_id', leadId)
    .maybeSingle()

  if (leseErr) return { ok: false, error: leseErr.message, gespiegelt: [] }
  if (!claim) return { ok: true, gespiegelt: [] } // noch kein Claim — die Konversion kopiert

  const claimRow = claim as unknown as Record<string, unknown>
  const patch: Record<string, unknown> = {}
  for (const feld of kandidaten) {
    if (claimRow[feld] === null || claimRow[feld] === undefined) patch[feld] = werte[feld]
  }
  const gespiegelt = Object.keys(patch) as QualiFeld[]
  if (gespiegelt.length === 0) return { ok: true, gespiegelt: [] }

  // Ergebnis pruefen: supabase-js wirft nicht. Ein stiller Fehlschlag hier hiesse, dass
  // Werkstatt und SV weiterhin "keine Angabe" sehen, obwohl der Kunde geantwortet hat —
  // exakt der Zustand, den dieser Helper beseitigen soll.
  const { error: schreibErr } = await admin
    .from('claims')
    .update(patch)
    .eq('id', claimRow.id as string)

  if (schreibErr) return { ok: false, error: schreibErr.message, gespiegelt: [] }
  return { ok: true, gespiegelt }
}
