import { FELDER, type AnreicherungsFeld, type Db } from './schreiben'
import { alleSeiten, inBloecken } from '../db/alle-seiten'

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
  // ⚠ SEITENWEISE. Ein Lauf schreibt eine Audit-Zeile je (Lead × Feld); bei
  // fünf Feldern reicht ein Lauf über 200 Leads, um die 1.000-Zeilen-Grenze zu
  // reissen. Ein einfaches `.select()` lieferte dann die ersten 1.000 — und
  // dieser Rückwärtsgang meldete einen VOLLSTÄNDIGEN Rollback, während der Rest
  // des Laufs unverändert stehen bliebe.
  const gelesen = await alleSeiten<{ sv_lead_id: string; feld: string; wert_vorher: string | null }>(
    (von, bis) =>
      db.from('levelup_anreicherung')
        .select('sv_lead_id,feld,wert_vorher,wert_nachher')
        .eq('lauf_id', laufId)
        .order('ts', { ascending: true })
        .order('sv_lead_id', { ascending: true })
        .range(von, bis),
  )

  if (!gelesen.ok) return { ok: false, error: `Lauf ${laufId} nicht lesbar: ${gelesen.error}` }
  const zeilen = gelesen.zeilen
  if (zeilen.length === 0) return { ok: true, zurueckgesetzt: 0, leads: 0 }

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
  //
  // ⚠⚠ IN BLÖCKEN, UND DIE MENGE MUSS VOLLSTÄNDIG SEIN. Hier ist eine
  // unvollständige Lesemenge kein Anzeigefehler, sondern ein falsches
  // SCHREIBEN: fehlt ein Lead in `jeId`, liefert `ziel()` für jedes seiner
  // Felder `undefined`, `leer(undefined)` ist `true` — und die Abräum-Zweige
  // unten nullen `website_gefunden`, `website_sicherheit`, `kontakt_quelle` und
  // `angereichert_am` an einem Lead, der diese Werte aus einem ANDEREN Lauf
  // trägt. Genau der Schaden, den der Kommentar oben verhindern soll.
  //
  // Zwei Grenzen zugleich: `.in()` mit tausenden Kennungen sprengt die
  // Query-Zeichenkette in der URL, und ohne `range` kämen höchstens 1.000
  // Zeilen zurück.
  const ids = [...jeLead.keys()]
  const geladen = await inBloecken<{ id: string }>(ids, (block, von, bis) =>
    db.from('sv_leads')
      .select('id,email,telefon,website_url,vorname,nachname')
      .in('id', block)
      .order('id', { ascending: true })
      .range(von, bis),
  )

  if (!geladen.ok) return { ok: false, error: `Leads nicht lesbar: ${geladen.error}` }

  // ⚠ Gegenprobe: kam für JEDE Kennung eine Zeile zurück? Ein Lead, der aus
  // dem Audit stammt, aber nicht mehr in `sv_leads` steht, ist gelöscht worden
  // — dann ist dieser Rückwärtsgang nicht zuständig und darf nicht raten.
  const jeId = new Map(geladen.zeilen.map((l) => [l.id, l as Record<string, unknown>]))
  const fehlend = ids.filter((id) => !jeId.has(id))
  if (fehlend.length > 0) {
    return {
      ok: false,
      error:
        `${fehlend.length} von ${ids.length} Leads des Laufs sind nicht mehr in sv_leads ` +
        `(erste: ${fehlend.slice(0, 3).join(', ')}). Rueckdreh abgebrochen — ohne den ` +
        `Ist-Zustand liesse sich nicht unterscheiden, ob ein Wert aus einem anderen Lauf stammt.`,
    }
  }

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
