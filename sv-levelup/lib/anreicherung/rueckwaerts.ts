import { FELDER, type AnreicherungsFeld, type Db } from './schreiben'

const KONTAKTFELDER: AnreicherungsFeld[] = ['email', 'telefon', 'vorname', 'nachname']

export type RueckErgebnis =
  | { ok: true; zurueckgesetzt: number; leads: number }
  | { ok: false; error: string }

function leer(w: unknown): boolean {
  return w === null || w === undefined || String(w).trim() === ''
}

/**
 * Dreht alle Aenderungen einer lauf_id zurueck — Feld fuer Feld auf wert_vorher.
 *
 * Das ist der Rueckwaertsgang, der die Entscheidung "direkt in sv_leads
 * schreiben, ohne manuelle Freigabestufe" (CONTEXT §10) tragbar macht.
 *
 * ⚠ Der Log wird NIE geloescht (T-26): "Zurueckdrehen loescht nicht, es
 * schreibt zurueck." levelup_anreicherung ist append-only — sonst waere nach
 * einem Rueckdreh nicht mehr belegbar, dass und woher eine Adresse einmal kam.
 *
 * ⚠ Die BEGLEITSPALTEN muessen mit zurueck. Am echten Lauf aufgefallen (18.08.,
 * f8d11785): sie stehen nicht im Audit, blieben deshalb stehen — und
 * `website_sicherheit = 90` neben `website_url = null` ist eine Sicherheit zu
 * einer Website, die es nicht mehr gibt. Deshalb wird der Lead-Zustand geladen
 * und der ZIELzustand berechnet, statt nur das Delta anzuwenden: nur so ist
 * unterscheidbar, ob ein verbliebener Wert aus einem anderen Lauf stammt.
 *
 * Idempotent: ein zweiter Aufruf setzt dieselben Werte erneut.
 */
export async function dreheLaufZurueck(db: Db, laufId: string): Promise<RueckErgebnis> {
  const { data: zeilen, error: ladeFehler } = await db
    .from('levelup_anreicherung')
    .select('sv_lead_id,feld,wert_vorher,wert_nachher')
    .eq('lauf_id', laufId)
    .order('ts', { ascending: true })

  if (ladeFehler) return { ok: false, error: `Lauf ${laufId} nicht lesbar: ${ladeFehler.message}` }
  if (!zeilen || zeilen.length === 0) return { ok: true, zurueckgesetzt: 0, leads: 0 }

  // Je Lead ein Update statt eines pro Feld — weniger Writes, ein Row-Check.
  const jeLead = new Map<string, Record<string, unknown>>()
  let zurueckgesetzt = 0

  for (const z of zeilen as { sv_lead_id: string; feld: string; wert_vorher: string | null }[]) {
    if (!FELDER.includes(z.feld as AnreicherungsFeld)) continue  // fremdes Feld: nicht anfassen
    const werte = jeLead.get(z.sv_lead_id) ?? {}
    werte[z.feld] = z.wert_vorher
    jeLead.set(z.sv_lead_id, werte)
    zurueckgesetzt += 1
  }

  if (jeLead.size === 0) return { ok: true, zurueckgesetzt: 0, leads: 0 }

  // Ist-Zustand laden, um den Zielzustand zu kennen (s. Begleitspalten oben).
  const ids = [...jeLead.keys()]
  const { data: leads, error: leadFehler } = await db
    .from('sv_leads')
    .select('id,email,telefon,website_url,vorname,nachname')
    .in('id', ids)

  if (leadFehler) return { ok: false, error: `Leads nicht lesbar: ${leadFehler.message}` }
  const jeId = new Map((leads ?? []).map((l: { id: string }) => [l.id, l as Record<string, unknown>]))

  for (const [leadId, werte] of jeLead) {
    const ist = jeId.get(leadId) ?? {}
    // Zielzustand = zurueckgedrehte Felder, alle anderen bleiben wie sie sind.
    const ziel = (feld: AnreicherungsFeld) => (feld in werte ? werte[feld] : ist[feld])

    if ('website_url' in werte && leer(ziel('website_url'))) {
      werte.website_gefunden = null
      werte.website_sicherheit = null
    }
    // Nur abraeumen, wenn KEIN Kontaktfeld uebrig bleibt — sonst reisst das
    // Zurueckdrehen eines Laufs die Quellenangabe eines anderen mit weg.
    if (KONTAKTFELDER.some((f) => f in werte) && KONTAKTFELDER.every((f) => leer(ziel(f)))) {
      werte.kontakt_quelle = null
    }
    if (FELDER.every((f) => leer(ziel(f)))) {
      werte.angereichert_am = null
    }

    const { data: rows, error } = await db
      .from('sv_leads')
      .update(werte)
      .eq('id', leadId)
      .select()

    if (error) return { ok: false, error: `Rueckdreh fuer ${leadId} fehlgeschlagen: ${error.message}` }
    if (!rows || rows.length === 0) {
      return { ok: false, error: `Rueckdreh traf 0 Zeilen fuer Lead ${leadId}` }
    }
  }

  return { ok: true, zurueckgesetzt, leads: jeLead.size }
}
