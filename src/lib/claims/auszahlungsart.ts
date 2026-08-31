// Die Auszahlungsart ('reparatur' | 'fiktiv' | 'unentschieden') sagt, ob der Schaden real
// repariert oder auf Gutachtenbasis ausgezahlt wird. Sie steuert, was Kunde, Werkstatt und
// Sachverstaendiger tun — und beim SV konkret, ob er UPE-Aufschlaege und Verbringungskosten
// gesondert ausweisen muss.
//
// REGEL (Aaron 30.08.2026):
//   1. Erhoben wird sie VOR dem Gutachten (im /flow am SA-Step, nur Haftpflicht).
//   2. Aendern duerfen sie DANACH BEIDE — der Kunde und der Sachverstaendige.
//   3. Mit der Fertigstellung des Gutachtens ist sie FINAL: danach aendert sie niemand mehr.
//
// Punkt 3 ist der Grund, warum diese Datei existiert: die Sperre darf nicht in einer der
// beiden Rollen-Actions leben, sonst gilt sie nur fuer eine von ihnen. Ein Gate, das nur an
// einer von zwei Tueren haengt, ist kein Gate.

import type { SupabaseClient } from '@supabase/supabase-js'

/** Die vom CHECK `claims_reparaturwunsch_check` erlaubten Werte (prod verifiziert 30.08.). */
export const AUSZAHLUNGSARTEN = ['reparatur', 'fiktiv', 'unentschieden'] as const
export type Auszahlungsart = (typeof AUSZAHLUNGSARTEN)[number]

export function istAuszahlungsart(wert: unknown): wert is Auszahlungsart {
  return typeof wert === 'string' && (AUSZAHLUNGSARTEN as readonly string[]).includes(wert)
}

/**
 * Liegt fuer den Claim ein FERTIGGESTELLTES Gutachten vor? Dann ist die Auszahlungsart final.
 *
 * Bewusst `fertiggestellt_am` und nicht `status`: ein hochgeladenes, aber noch nicht
 * fertiggestelltes Gutachten sperrt nichts — erst das fertige Dokument ist die Grundlage,
 * auf der reguliert wird.
 */
export async function gutachtenIstFinal(
  db: SupabaseClient,
  claimId: string,
): Promise<{ final: boolean; seit: string | null; error?: string }> {
  const { data, error } = await db
    .from('gutachten')
    .select('fertiggestellt_am')
    .eq('claim_id', claimId)
    .not('fertiggestellt_am', 'is', null)
    .order('fertiggestellt_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Im Fehlerfall NICHT stillschweigend entsperren: wer nicht weiss, ob ein Gutachten
  // vorliegt, darf den Wert nicht ueberschreiben. Lieber eine Fehlermeldung als eine
  // Aenderung, die die Regel bricht.
  if (error) return { final: true, seit: null, error: error.message }
  return { final: Boolean(data?.fertiggestellt_am), seit: (data?.fertiggestellt_am as string) ?? null }
}

export type AuszahlungsartErgebnis =
  | { ok: true; wert: Auszahlungsart }
  | { ok: false; error: string; gesperrt?: boolean }

/**
 * Setzt die Auszahlungsart eines Claims — die EINE Stelle, an der die Sperre gilt.
 *
 * Der Aufrufer hat die Berechtigung bereits geprueft (SV: sv_id-Match, Kunde: RLS-SELECT auf
 * den eigenen Claim). Diese Funktion prueft nur noch die fachliche Regel und schreibt.
 *
 * `db` muss ein Client mit Schreibrecht auf `claims` sein (Service-/Admin-Client) — weder
 * Kunde noch SV haben ein RLS-UPDATE darauf. Das `.select()` am Update ist trotzdem Pflicht:
 * ein 0-Row-Treffer (falsche id) meldet sonst keinen Fehler.
 */
export async function setzeAuszahlungsart(
  db: SupabaseClient,
  claimId: string,
  wert: unknown,
  /**
   * Protokoll-Kontext. Ohne ihn wird der Wert STILL geaendert — bei einem Feld, das Kunde,
   * Werkstatt UND Sachverstaendiger lesen und das ZWEI Parteien aendern duerfen, waere
   * hinterher nicht nachvollziehbar, wer umgestellt hat. Optional, damit Aufrufer ohne
   * Nutzerkontext (Backfills, Migrationen) die Funktion weiter nutzen koennen.
   */
  protokoll?: { fallId: string; userId: string; akteur: string },
): Promise<AuszahlungsartErgebnis> {
  if (!istAuszahlungsart(wert)) {
    return { ok: false, error: 'Ungültige Auszahlungsart.' }
  }

  const gutachten = await gutachtenIstFinal(db, claimId)
  if (gutachten.error) {
    return { ok: false, error: `Gutachten-Status nicht lesbar: ${gutachten.error}` }
  }
  if (gutachten.final) {
    return {
      ok: false,
      gesperrt: true,
      error: 'Das Gutachten liegt vor — die Abrechnungsart steht damit fest und ist nicht mehr änderbar.',
    }
  }

  const { data, error } = await db
    .from('claims')
    .update({ reparaturwunsch: wert })
    .eq('id', claimId)
    .select('id')

  if (error) return { ok: false, error: error.message }
  if (!data || data.length === 0) return { ok: false, error: 'Vorgang nicht gefunden.' }

  // Non-critical (AGENTS.md §Server-Actions): die Aenderung steht bereits. Ein Fehler beim
  // Protokollieren darf sie nicht zuruecknehmen — aber er wird geloggt, nicht verschluckt.
  // `typ: 'system'` ist der etablierte Wert fuer solche Aenderungen (259 Eintraege auf prod,
  // u.a. saveBankdaten). Nur `fall_id` setzen genuegt: zwei Trigger
  // (trg_derive_claim_id, trg_timeline_fill_claim_id) leiten claim_id daraus ab.
  if (protokoll) {
    const { error: protoErr } = await db.from('timeline').insert({
      fall_id: protokoll.fallId,
      typ: 'system',
      titel: `Abrechnungsart geändert: ${LABEL[wert]}`,
      beschreibung: `Geändert durch ${protokoll.akteur}. Mit der Fertigstellung des Gutachtens ist die Abrechnungsart final.`,
      erstellt_von: protokoll.userId,
    })
    if (protoErr) console.error('[auszahlungsart] Timeline-Eintrag fehlgeschlagen:', protoErr.message)
  }

  return { ok: true, wert }
}

/** Nutzersichtbare Bezeichnungen — auch im Protokoll, damit dort nicht `fiktiv` steht. */
const LABEL: Record<Auszahlungsart, string> = {
  reparatur: 'Reparatur in der Werkstatt',
  fiktiv: 'Fiktive Abrechnung (Auszahlung)',
  unentschieden: 'Noch offen',
}
