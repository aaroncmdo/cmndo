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
  check: 'ust_tripel' | 'reconciliation'
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

/**
 * Test-/Smoke-/Demo-Partner erkennen (name/firma ODER email enthaelt test/smoke/demo als Wort).
 * Der Monitor alarmiert auf ECHTES Geld — Smoke-Fixtures (die z.B. eine Provision direkt auf
 * `ausgezahlt` setzen, ohne den §14-Beleg zu erzeugen) sollen ihn nicht taeglich rot faerben.
 * Word-Boundary (`\b`) vermeidet False-Positives wie "Contest" (matcht NICHT "test").
 * Kein `ist_testaccount`-Flag auf werkstaetten/makler -> name/email-Heuristik (konservativ).
 */
export function istTestPartner(name: string | null, email: string | null): boolean {
  return /\b(test|smoke|demo)\b/i.test(`${name ?? ''} ${email ?? ''}`)
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

// Ledger-Cache-Regression (Check 3) entfernt (Normalisierung Slice 4): die geprueften Cache-Spalten
// regulierungs_betrag + auszahlung_gutachter_betrag werden retired (auf's Ledger kollabiert) — nach dem
// DROP COLUMN gibt es keinen Cache mehr, gegen den zu pruefen waere. USt + §14-Reconciliation bleiben.

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
  // Test-/Smoke-Partner werden ausgeschlossen (istTestPartner) — der Monitor alarmiert auf ECHTES
  // Geld, nicht auf Smoke-Fixtures. Ausschluss NUR hier (nicht in USt/Cache): nur diese Pruefung
  // reagiert auf einen Workflow-State (ausgezahlt-ohne-Beleg), den Smoke-Skripte bewusst setzen.
  geprueft++
  {
    const { data: paid, error } = await from('partner_provisionen')
      .select('id, partner_typ, partner_id')
      .not('ausgezahlt_am', 'is', null)
    if (error) {
      findings.push({ check: 'reconciliation', severity: 'warning', tabelle: 'partner_provisionen', count: 0, detail: `Query-Fehler: ${error.message}` })
    } else {
      const paidRows = (paid ?? []) as Array<{ id: string; partner_typ: string; partner_id: string }>
      // Test-Partner-Ids ermitteln (nur unter den Partnern mit ausgezahlten Provisionen).
      const testPartnerIds = new Set<string>()
      const wsIds = [...new Set(paidRows.filter((p) => p.partner_typ === 'werkstatt').map((p) => p.partner_id))]
      const mkIds = [...new Set(paidRows.filter((p) => p.partner_typ === 'makler').map((p) => p.partner_id))]
      if (wsIds.length > 0) {
        const { data: ws } = await from('werkstaetten').select('id, name, email').in('id', wsIds)
        for (const w of (ws ?? []) as Array<{ id: string; name: string | null; email: string | null }>) {
          if (istTestPartner(w.name, w.email)) testPartnerIds.add(w.id)
        }
      }
      if (mkIds.length > 0) {
        const { data: mk } = await from('makler').select('id, firma, email').in('id', mkIds)
        for (const m of (mk ?? []) as Array<{ id: string; firma: string | null; email: string | null }>) {
          if (istTestPartner(m.firma, m.email)) testPartnerIds.add(m.id)
        }
      }
      const paidIds = paidRows.filter((p) => !testPartnerIds.has(p.partner_id)).map((p) => p.id)
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

  // (Check 3 Ledger-Cache-Regression entfernt — s.o.; die Cache-Spalten werden in Slice 4 retired.)

  return { ok: findings.length === 0, geprueft, findings }
}
