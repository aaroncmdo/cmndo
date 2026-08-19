import type { Db } from '../anreicherung/schreiben'
import { ladeCheck } from './check'

/** Mehr als das ist keine Berufserfahrung mehr, sondern ein Tippfehler. */
const MAX_JAHRE = 60

export type FunnelAntworten = {
  jahreErfahrung?: string | null
  kiNutzung?: string | null
  marketingPartner?: string | null
}

export type FunnelErgebnis = { ok: true } | { ok: false; error: string }

/**
 * „über 10 Jahre" → 10.
 *
 * ⚠ `levelup_funnel.jahre_erfahrung` ist TEXT (eine Spanne, wie der
 * Sachverstaendige sie anklickt), `sv_leads.jahre_erfahrung` ist INTEGER. Aus
 * einer Spanne eine Zahl zu machen verliert Information — genommen wird
 * deshalb die UNTERE Grenze: bei „über 10 Jahre" ist 10 wahr (er hat
 * mindestens zehn), 15 waere geraten.
 *
 * Steht keine brauchbare Zahl drin, wird NICHTS nachgezogen. Ein erfundener
 * Wert in der Vertriebsliste ist schlechter als eine leere Spalte (R-B).
 */
export function jahreAlsZahl(text: string | null | undefined): number | null {
  const roh = text?.trim()
  if (!roh) return null

  // Ein fuehrendes Minus ist keine Spanne, sondern Unsinn.
  if (roh.startsWith('-')) return null

  const treffer = roh.match(/\d+/)
  if (!treffer) return null

  const zahl = Number(treffer[0])
  if (!Number.isFinite(zahl) || zahl > MAX_JAHRE) return null

  return zahl
}

/**
 * F-08 · Funnel speichern.
 *
 * Drei Fragen nach dem Terminwunsch. Sie sind ueberspringbar — was fehlt,
 * bleibt leer und wird nicht erfunden.
 */
export async function speichereFunnel(
  db: Db,
  token: string,
  antworten: FunnelAntworten,
): Promise<FunnelErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }

  // F-08: nur nach F-06. Ohne Lead gaebe es niemanden, dem die Antworten
  // gehoeren.
  if (!check.sv_lead_id) return { ok: false, error: 'kein_lead' }

  const { error } = await db.from('levelup_funnel').upsert({
    check_id: check.id,
    jahre_erfahrung: antworten.jahreErfahrung ?? null,
    ki_nutzung: antworten.kiNutzung ?? null,
    marketing_partner: antworten.marketingPartner ?? null,
    beantwortet_am: new Date().toISOString(),
  })

  if (error) return { ok: false, error: `Antworten nicht speicherbar: ${error.message}` }

  await zieheJahreNach(db, check.sv_lead_id, antworten.jahreErfahrung)

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'funnel_fertig',
    payload: { beantwortet: Object.values(antworten).filter(Boolean).length },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true }
}

/** Nur in eine LEERE Spalte — dieselbe Regel wie in der Anreicherung (T-24). */
async function zieheJahreNach(db: Db, leadId: string, text: string | null | undefined): Promise<void> {
  const jahre = jahreAlsZahl(text)
  if (jahre === null) return

  const { data: lead } = await db
    .from('sv_leads')
    .select('id,jahre_erfahrung')
    .eq('id', leadId)
    .maybeSingle()

  if (!lead || (lead as { jahre_erfahrung: number | null }).jahre_erfahrung !== null) return

  const { error } = await db
    .from('sv_leads')
    .update({ jahre_erfahrung: jahre })
    .eq('id', leadId)
    .select()

  if (error) console.error('Jahre nicht nachziehbar:', error.message)
}
