// Makler-Vertriebs-Pipeline fuers Dashboard: der Funnel von Leads ueber
// Vermittlungen bis zur Auszahlung + die Geld-Pipeline (abrechenbar = naechste
// Auszahlung, ausgezahlt = bereits erhalten). Ergaenzt die Monats-KPIs im
// Stat-Grid um eine All-Time-Flow-Sicht.
//
// Der DB-Fetch (getMaklerPipeline) delegiert die Buckets/Summen an das pure
// aggregierePipeline — das ist der getestete Seam. db wird injiziert (kein
// server-only Import) → im vitest direkt testbar.

import type { SupabaseClient } from '@supabase/supabase-js'

export type MaklerPipeline = {
  /** Vermittlungen gesamt (alle Provisionen ausser storniert). */
  vermittelt: number
  /** Vermittelt, noch im Hold/Pruefung (Status pending). */
  pendingAnzahl: number
  /** Abrechenbar = freigegeben (naechste Auszahlung). */
  abrechenbarAnzahl: number
  abrechenbarSumme: number
  /** Bereits ausgezahlt. */
  ausgezahltAnzahl: number
  ausgezahltSumme: number
}

/**
 * Pure: Provisions-Zeilen → Funnel-Buckets + Summen. Storniert wird komplett
 * ignoriert (keine erfolgreiche Vermittlung). Summen nur fuer die Geld-Stufen
 * (freigegeben/ausgezahlt) — pending traegt kein abrechenbares Geld.
 */
export function aggregierePipeline(
  rows: Array<{ status: string; betrag_netto_eur: number | string }>,
): MaklerPipeline {
  const p: MaklerPipeline = {
    vermittelt: 0,
    pendingAnzahl: 0,
    abrechenbarAnzahl: 0,
    abrechenbarSumme: 0,
    ausgezahltAnzahl: 0,
    ausgezahltSumme: 0,
  }
  for (const r of rows) {
    if (r.status === 'storniert') continue
    const betrag = Number(r.betrag_netto_eur ?? 0)
    p.vermittelt++
    if (r.status === 'pending') {
      p.pendingAnzahl++
    } else if (r.status === 'freigegeben') {
      p.abrechenbarAnzahl++
      p.abrechenbarSumme += betrag
    } else if (r.status === 'ausgezahlt') {
      p.ausgezahltAnzahl++
      p.ausgezahltSumme += betrag
    }
  }
  return p
}

/** Laedt die Provisionen des Maklers (RLS-scoped) und verdichtet sie zum Funnel. */
export async function getMaklerPipeline(
  db: SupabaseClient,
  maklerId: string,
): Promise<MaklerPipeline> {
  const { data } = await db
    .from('partner_provisionen')
    .select('status, betrag_netto_eur')
    .eq('partner_typ', 'makler')
    .eq('partner_id', maklerId)
  return aggregierePipeline(
    (data ?? []) as Array<{ status: string; betrag_netto_eur: number | string }>,
  )
}
