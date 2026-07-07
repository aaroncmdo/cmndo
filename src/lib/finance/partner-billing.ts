// v_partner_billing: neu in diesem Branch (Migration 20260704123618), Typen folgen beim
// Merge-Regen (Regel 2). Zugriff ungetypt + Cast auf PartnerBillingRow.
import type { SupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'

export interface PartnerBillingRow {
  quelle_tabelle: string
  quelle_id: string
  partner_typ: string
  partner_id: string | null
  partner_name: string | null
  richtung: 'forderung' | 'auszahlung'
  dokument_typ: string
  referenz_nr: string | null
  betrag_netto: number | null
  ust_satz: number | null
  ust_betrag: number | null
  betrag_brutto: number | null
  ust_status_bekannt: boolean
  status_norm: string
  status_roh: string | null
  datum: string | null
  faellig_am: string | null
  erledigt_am: string | null
  claim_id: string | null
  fall_id: string | null
}

export interface PartnerBillingAggregat {
  /** key = `${richtung}:${status_norm}` */
  perStatus: Record<string, { netto: number; brutto: number; anzahl: number }>
  perPartnerTyp: Record<string, { netto: number; brutto: number; anzahl: number }>
  hat_unbekannten_ust_status: boolean
}

/** Leeres Aggregat fuer Fehler-/Empty-Fall. */
function emptyAggregat(): PartnerBillingAggregat {
  return { perStatus: {}, perPartnerTyp: {}, hat_unbekannten_ust_status: false }
}

/** Akkumuliert eine Row in ein Bucket-Objekt (mutiert bucket in-place). */
function accumulate(
  bucket: Record<string, { netto: number; brutto: number; anzahl: number }>,
  key: string,
  row: PartnerBillingRow,
): void {
  if (!bucket[key]) {
    bucket[key] = { netto: 0, brutto: 0, anzahl: 0 }
  }
  bucket[key].netto += row.betrag_netto ?? 0
  bucket[key].brutto += row.betrag_brutto ?? 0
  bucket[key].anzahl += 1
}

/**
 * Laedt alle Zeilen aus v_partner_billing (optional gefiltert) und berechnet ein Aggregat.
 *
 * Sortierung: datum DESC, NULL-Datum ans Ende (als aeltester Wert behandelt).
 */
export async function getPartnerBilling(
  opts?: { partnerTyp?: string; partnerId?: string },
): Promise<{ rows: PartnerBillingRow[]; aggregat: PartnerBillingAggregat }> {
  // createAdminClient() ist server-only — dieses File darf nie 'use client' haben.
  const db = createAdminClient() as unknown as SupabaseClient

  let query = db.from('v_partner_billing').select('*')

  if (opts?.partnerTyp) {
    query = query.eq('partner_typ', opts.partnerTyp)
  }
  if (opts?.partnerId) {
    query = query.eq('partner_id', opts.partnerId)
  }

  const { data, error } = await query

  if (error) {
    console.error('[partner-billing] v_partner_billing query failed:', error.message)
    return { rows: [], aggregat: emptyAggregat() }
  }

  const rawRows = (data ?? []) as PartnerBillingRow[]

  // Sortierung: datum DESC, NULL ans Ende (NULL = aeltester Wert)
  const rows = [...rawRows].sort((a, b) => {
    if (a.datum === null && b.datum === null) return 0
    if (a.datum === null) return 1   // null → ans Ende
    if (b.datum === null) return -1
    return b.datum.localeCompare(a.datum)
  })

  // Aggregat
  const perStatus: Record<string, { netto: number; brutto: number; anzahl: number }> = {}
  const perPartnerTyp: Record<string, { netto: number; brutto: number; anzahl: number }> = {}
  let hat_unbekannten_ust_status = false

  for (const row of rows) {
    const statusKey = `${row.richtung}:${row.status_norm}`
    accumulate(perStatus, statusKey, row)
    accumulate(perPartnerTyp, row.partner_typ, row)

    if (row.richtung === 'auszahlung' && row.ust_status_bekannt === false) {
      hat_unbekannten_ust_status = true
    }
  }

  return { rows, aggregat: { perStatus, perPartnerTyp, hat_unbekannten_ust_status } }
}

export type LedgerGutschriftDocs = {
  original?: { nr: string }
  storno?: { nr: string; bezugNr: string | null }
}

export type GutschriftRohzeile = {
  id: string
  gutschrift_nr: string
  typ: string
  bezug_gutschrift_id: string | null
  ledger_tabelle: string
  ledger_id: string
}

/**
 * Baut aus den partner_gutschriften-Rohzeilen eines Partners eine Map
 * ledgerKey ("tabelle:id") -> { original?, storno? }. Der Storno-Bezug (Original-Nr)
 * wird aus derselben Zeilenmenge aufgeloest (id -> gutschrift_nr), kein Extra-Query.
 */
export function buildGutschriftDocsByLedger(
  rows: GutschriftRohzeile[],
): Record<string, LedgerGutschriftDocs> {
  const idToNr = new Map<string, string>()
  for (const r of rows) idToNr.set(r.id, r.gutschrift_nr)

  const map: Record<string, LedgerGutschriftDocs> = {}
  for (const r of rows) {
    const key = `${r.ledger_tabelle}:${r.ledger_id}`
    const entry = (map[key] ??= {})
    if (r.typ === 'storno') {
      entry.storno = {
        nr: r.gutschrift_nr,
        bezugNr: r.bezug_gutschrift_id ? idToNr.get(r.bezug_gutschrift_id) ?? null : null,
      }
    } else {
      entry.original = { nr: r.gutschrift_nr }
    }
  }
  return map
}

export type ZeilenBeleg = { typ: 'gutschrift' | 'storno'; nr: string; bezugNr: string | null }

/**
 * Welche Gutschrift-Belege sind fuer eine Billing-Zeile herunterladbar.
 * Nur Auszahlungszeilen (erledigt/storniert): Original + ggf. Storno-Korrekturbeleg.
 */
export function belegeFuerZeile(
  row: Pick<PartnerBillingRow, 'richtung' | 'status_norm' | 'quelle_tabelle' | 'quelle_id'>,
  docs: Record<string, LedgerGutschriftDocs>,
): ZeilenBeleg[] {
  if (row.richtung !== 'auszahlung') return []
  if (row.status_norm !== 'erledigt' && row.status_norm !== 'storniert') return []
  const entry = docs[`${row.quelle_tabelle}:${row.quelle_id}`]
  if (!entry) return []
  const out: ZeilenBeleg[] = []
  if (entry.original) out.push({ typ: 'gutschrift', nr: entry.original.nr, bezugNr: null })
  if (entry.storno) out.push({ typ: 'storno', nr: entry.storno.nr, bezugNr: entry.storno.bezugNr })
  return out
}
