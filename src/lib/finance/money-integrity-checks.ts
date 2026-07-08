// Money-Integrity-Checks — operationalisiert das Money-Model-Audit (Session 6f60c510,
// docs/superpowers/specs/2026-07-08-money-model-gesamt-audit.md) als wiederholbare, automatisierbare
// Pruefungen. Konsumenten: der Cron `api/cron/money-integrity-check` (periodisch) + die Admin-Action
// `pruefeMoneyIntegritaet` (on-demand im Finance-Hub). Pre-launch (0-9 Zeilen) meist leer — der Wert
// kommt post-launch, sobald echtes Geld fliesst (findet USt-Rechenfehler / §14-Beleg-Luecken /
// Ledger-Cache-Drift, bevor sie sich stauen).
//
// Reine Detektions-Helfer (unten) sind DB-frei + unit-getestet; `runMoneyIntegrityChecks` ist duenne
// Fetch-Glue drumherum. Graceful: ein Query-Fehler wird zu einem 'warning'-Finding, nie zum Crash.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type MoneyIntegrityFinding = {
  check: 'ust_tripel' | 'reconciliation' | 'ledger_cache'
  severity: 'critical' | 'warning'
  tabelle: string
  count: number
  detail: string
  beispiel_ids?: string[]
}

export type MoneyIntegrityReport = {
  ok: boolean // true = 0 Findings
  geprueft: number // Anzahl gefahrener Checks
  findings: MoneyIntegrityFinding[]
}

// ── Reine Detektions-Helfer (testbar ohne DB) ───────────────────────────────

/**
 * Ist das USt-Tripel konsistent — brutto == netto + ust (auf Cent-Genauigkeit)?
 * null-Werte -> true (unvollstaendig zaehlt nicht als Fehler). Coerct Strings (Postgres numeric
 * kommt via supabase-js je nach Groesse als number ODER string).
 */
export function isUstTripleConsistent(
  netto: number | string | null,
  ust: number | string | null,
  brutto: number | string | null,
): boolean {
  if (netto == null || ust == null || brutto == null) return true
  return Math.round((Number(netto) + Number(ust)) * 100) === Math.round(Number(brutto) * 100)
}

/** Filtert die Zeilen mit inkonsistentem USt-Tripel (gemaess der Spalten-Zuordnung). */
export function findUstInconsistencies<T extends Record<string, unknown>>(
  rows: T[],
  cols: { netto: keyof T; ust: keyof T; brutto: keyof T },
): T[] {
  return rows.filter(
    (r) =>
      !isUstTripleConsistent(
        r[cols.netto] as number | string | null,
        r[cols.ust] as number | string | null,
        r[cols.brutto] as number | string | null,
      ),
  )
}

/** Reine Mengendifferenz: welche `ids` haben keinen Eintrag in `vorhandene`? */
export function idsOhneMatch(ids: string[], vorhandene: string[]): string[] {
  const set = new Set(vorhandene)
  return ids.filter((id) => !set.has(id))
}

// ── DB-Orchestrierung ───────────────────────────────────────────────────────

// USt-Tripel-Tabellen (Spaltennamen 2026-07-08 gg prod-Schema verifiziert — abweichendes Naming
// pro Tabelle, insb. gutschriften.mwst_betrag statt ust_betrag).
const UST_TABELLEN: ReadonlyArray<{ tabelle: string; netto: string; ust: string; brutto: string }> = [
  { tabelle: 'abrechnungen', netto: 'summe_netto', ust: 'ust_betrag', brutto: 'summe_brutto' },
  { tabelle: 'partner_provisionen', netto: 'betrag_netto_eur', ust: 'ust_betrag', brutto: 'betrag_brutto' },
  { tabelle: 'partner_gutschriften', netto: 'betrag_netto', ust: 'ust_betrag', brutto: 'betrag_brutto' },
  { tabelle: 'gutschriften', netto: 'betrag_netto', ust: 'mwst_betrag', brutto: 'betrag_brutto' },
  { tabelle: 'provisionen_maik', netto: 'netto_provision', ust: 'ust_betrag', brutto: 'betrag_brutto' },
]

// Ledger-Cache-Regression: claims-Cache-Money-Spalte -> erwartete claim_payments-partei.
const CACHE_CHECKS: ReadonlyArray<{ cacheCol: string; partei: 'vs' | 'sv'; label: string }> = [
  { cacheCol: 'regulierungs_betrag', partei: 'vs', label: 'VS-Regulierung' },
  { cacheCol: 'auszahlung_gutachter_betrag', partei: 'sv', label: 'SV-Auszahlung' },
]

/**
 * Faehrt alle Money-Integritaets-Checks gegen die DB und liefert einen strukturierten Report.
 * Braucht einen service-role-Client (createAdminClient) — die Checks lesen tabellenuebergreifend.
 */
export async function runMoneyIntegrityChecks(
  db: SupabaseClient<Database>,
): Promise<MoneyIntegrityReport> {
  // Dynamische Tabellennamen -> lose from()-Sicht (die reinen Helfer bleiben streng getypt).
  const from = (t: string) => (db as unknown as { from: (t: string) => any }).from(t)
  const findings: MoneyIntegrityFinding[] = []
  let geprueft = 0

  // Check 1: USt-Tripel-Konsistenz (brutto == netto + ust) ueber alle Money-Tabellen.
  for (const t of UST_TABELLEN) {
    geprueft++
    const { data, error } = await from(t.tabelle).select(`id, ${t.netto}, ${t.ust}, ${t.brutto}`)
    if (error) {
      findings.push({ check: 'ust_tripel', severity: 'warning', tabelle: t.tabelle, count: 0, detail: `Query-Fehler: ${error.message}` })
      continue
    }
    const bad = findUstInconsistencies((data ?? []) as Array<Record<string, unknown>>, {
      netto: t.netto,
      ust: t.ust,
      brutto: t.brutto,
    })
    if (bad.length > 0) {
      findings.push({
        check: 'ust_tripel',
        severity: 'critical',
        tabelle: t.tabelle,
        count: bad.length,
        detail: `${bad.length} Zeile(n): brutto != netto + ust (${t.netto}+${t.ust}!=${t.brutto})`,
        beispiel_ids: bad.slice(0, 5).map((r) => String(r.id)),
      })
    }
  }

  // Check 2: Reconciliation — jede AUSGEZAHLTE Provision (ausgezahlt_am gesetzt) braucht einen
  // §14-Self-Billing-Beleg (partner_gutschriften). Fehlender Beleg = Beleg-Luecke.
  geprueft++
  {
    const { data: paid, error } = await from('partner_provisionen')
      .select('id')
      .not('ausgezahlt_am', 'is', null)
    if (error) {
      findings.push({ check: 'reconciliation', severity: 'warning', tabelle: 'partner_provisionen', count: 0, detail: `Query-Fehler: ${error.message}` })
    } else {
      const paidIds = ((paid ?? []) as Array<{ id: string }>).map((r) => r.id)
      if (paidIds.length > 0) {
        const { data: belege, error: belErr } = await from('partner_gutschriften')
          .select('ledger_id')
          .eq('ledger_tabelle', 'partner_provisionen')
          .in('ledger_id', paidIds)
        if (belErr) {
          findings.push({ check: 'reconciliation', severity: 'warning', tabelle: 'partner_gutschriften', count: 0, detail: `Query-Fehler: ${belErr.message}` })
        } else {
          const belegteIds = ((belege ?? []) as Array<{ ledger_id: string }>).map((r) => r.ledger_id)
          const ohneBeleg = idsOhneMatch(paidIds, belegteIds)
          if (ohneBeleg.length > 0) {
            findings.push({
              check: 'reconciliation',
              severity: 'critical',
              tabelle: 'partner_provisionen',
              count: ohneBeleg.length,
              detail: `${ohneBeleg.length} ausgezahlte Provision(en) ohne §14-Gutschrift-Beleg`,
              beispiel_ids: ohneBeleg.slice(0, 5),
            })
          }
        }
      }
    }
  }

  // Check 3: Ledger-Cache-Regression — ein claims-Cache-Money-Wert ohne korrespondierende
  // claim_payments-Ledger-Zeile ist fuer die collapsed Reader (die den Ledger lesen) unsichtbar.
  for (const c of CACHE_CHECKS) {
    geprueft++
    const { data: cached, error } = await from('claims')
      .select(`id, ${c.cacheCol}`)
      .not(c.cacheCol, 'is', null)
    if (error) {
      findings.push({ check: 'ledger_cache', severity: 'warning', tabelle: 'claims', count: 0, detail: `Query-Fehler (${c.label}): ${error.message}` })
      continue
    }
    const cachedIds = ((cached ?? []) as Array<{ id: string }>).map((r) => r.id)
    if (cachedIds.length === 0) continue
    const { data: ledger, error: lErr } = await from('claim_payments')
      .select('claim_id')
      .eq('partei', c.partei)
      .in('claim_id', cachedIds)
    if (lErr) {
      findings.push({ check: 'ledger_cache', severity: 'warning', tabelle: 'claim_payments', count: 0, detail: `Query-Fehler (${c.label}): ${lErr.message}` })
      continue
    }
    const ledgeredIds = ((ledger ?? []) as Array<{ claim_id: string }>).map((r) => r.claim_id)
    const cacheOnly = idsOhneMatch(cachedIds, ledgeredIds)
    if (cacheOnly.length > 0) {
      findings.push({
        check: 'ledger_cache',
        severity: 'warning',
        tabelle: 'claims',
        count: cacheOnly.length,
        detail: `${cacheOnly.length} Claim(s): ${c.label}-Cache gesetzt, aber keine claim_payments(${c.partei})-Ledger-Zeile`,
        beispiel_ids: cacheOnly.slice(0, 5),
      })
    }
  }

  return { ok: findings.length === 0, geprueft, findings }
}
