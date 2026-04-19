// AAR-542 (C5): Higher-Level-Wrapper um den ruleEvaluator.
// Nimmt Katalog-Slots + fall + lead + bestehende pflichtdokumente-Rows
// und erzeugt die PflichtDocMatrix, die der Dokumente-Tab oben anzeigt.
//
// Begründung (AGENTS.md §3 Redundanz): Keine neue regel-engine.ts — der
// bestehende evaluateKatalogRule in ruleEvaluator.ts wurde um die in
// AAR-542 spezifizierten Operatoren (gt/lt/gte/lte/is_null/is_not_null)
// erweitert. Dieser Wrapper fokussiert auf das Pflicht-Matrix-Shape.

import {
  buildKatalogContext,
  evaluateKatalogRule,
  type Rule,
  type EvalContext,
} from './ruleEvaluator'
import type { DokumentKatalogRow } from './katalog'

export type PflichtDocStatus =
  | 'not_applicable'
  | 'offen'
  | 'hochgeladen'
  | 'nachgereicht'
  | 'ok'

export interface PflichtDocMatrixEntry {
  slot_id: string
  label: string
  kategorie: string
  beschreibung: string | null
  freigeschaltet: boolean
  pflicht: boolean
  status: PflichtDocStatus
  regel_erklaerung: string
  freigeschaltet_wenn: Rule | null
  pflicht_wenn: Rule | null
  pflicht_row_id: string | null
  // Warnung wenn DB-Row pflicht=true aber Regel sagt nicht Pflicht (und umgekehrt).
  inkonsistenz: 'db_pflicht_ohne_regel' | 'regel_pflicht_ohne_db' | null
}

export type PflichtdokumenteRow = {
  id: string
  dokument_typ: string
  status: string | null
  pflicht: boolean | null
  dokument_url?: string | null
  hochgeladen_am?: string | null
}

function dbStatusToMatrix(status: string | null | undefined): PflichtDocStatus {
  if (!status) return 'offen'
  if (status === 'geprueft') return 'ok'
  if (status === 'hochgeladen') return 'hochgeladen'
  if (status === 'nachgereicht_angefordert') return 'nachgereicht'
  if (status === 'ausstehend') return 'offen'
  return 'offen'
}

/**
 * Erklärt in einem Satz, warum ein Slot pflicht/optional/disabled ist.
 * Wird als Tooltip-Text verwendet.
 */
export function regelZuText(
  rule: Rule | null | undefined,
  ctx: EvalContext,
  prefix: string,
): string {
  if (rule == null) return `${prefix}: keine Bedingung (immer wahr)`
  if (typeof rule === 'object' && !('op' in (rule as Record<string, unknown>))) {
    return `${prefix}: keine Bedingung (immer wahr)`
  }
  return `${prefix}: ${ruleToString(rule, ctx)}`
}

function ruleToString(rule: Rule, ctx: EvalContext): string {
  switch (rule.op) {
    case 'eq':
      return `${rule.field} = ${JSON.stringify(rule.value)} (aktuell: ${JSON.stringify(ctx[rule.field] ?? null)})`
    case 'neq':
      return `${rule.field} ≠ ${JSON.stringify(rule.value)}`
    case 'in':
      return `${rule.field} ∈ [${rule.value.map((v) => JSON.stringify(v)).join(', ')}]`
    case 'not_in':
      return `${rule.field} ∉ [${rule.value.map((v) => JSON.stringify(v)).join(', ')}]`
    case 'gt':
      return `${rule.field} > ${rule.value}`
    case 'lt':
      return `${rule.field} < ${rule.value}`
    case 'gte':
      return `${rule.field} ≥ ${rule.value}`
    case 'lte':
      return `${rule.field} ≤ ${rule.value}`
    case 'is_null':
      return `${rule.field} ist leer`
    case 'is_not_null':
      return `${rule.field} ist gesetzt`
    case 'truthy':
      return `${rule.field} ist gesetzt/wahr`
    case 'falsy':
      return `${rule.field} ist leer/falsch`
    case 'and':
      return rule.conditions.map((c) => ruleToString(c, ctx)).join(' UND ')
    case 'or':
      return rule.conditions.map((c) => ruleToString(c, ctx)).join(' ODER ')
    case 'not':
      return `NICHT (${ruleToString(rule.condition, ctx)})`
    default:
      return '?'
  }
}

/**
 * Evaluiert alle Katalog-Slots gegen fall+lead und merged die
 * pflichtdokumente-Rows (falls vorhanden) in den Status-Indikator.
 */
export function evaluatePflichtdocs(args: {
  katalog: DokumentKatalogRow[]
  fall: Record<string, unknown> | null | undefined
  lead: Record<string, unknown> | null | undefined
  pflichtdokumente: PflichtdokumenteRow[]
}): PflichtDocMatrixEntry[] {
  const ctx = buildKatalogContext({ lead: args.lead ?? null, fall: args.fall ?? null })
  const rowBySlot = new Map<string, PflichtdokumenteRow>()
  for (const r of args.pflichtdokumente) {
    rowBySlot.set(r.dokument_typ, r)
  }

  const entries: PflichtDocMatrixEntry[] = []
  for (const slot of args.katalog) {
    if (slot.slot_id === 'kunde-nachreichung') continue // Sammelslot

    const freigeschaltet = evaluateKatalogRule(slot.freigeschaltet_wenn, ctx)
    const pflichtByRegel =
      slot.pflicht_wenn != null && freigeschaltet
        ? evaluateKatalogRule(slot.pflicht_wenn, ctx)
        : false

    const row = rowBySlot.get(slot.slot_id)
    const status: PflichtDocStatus = !freigeschaltet
      ? 'not_applicable'
      : row
        ? dbStatusToMatrix(row.status)
        : 'offen'

    // Inkonsistenzen: DB sagt pflicht=true aber Regel sagt nicht, oder umgekehrt.
    let inkonsistenz: PflichtDocMatrixEntry['inkonsistenz'] = null
    if (row && row.pflicht === true && !pflichtByRegel && freigeschaltet) {
      inkonsistenz = 'db_pflicht_ohne_regel'
    } else if (pflichtByRegel && (!row || row.pflicht !== true)) {
      inkonsistenz = 'regel_pflicht_ohne_db'
    }

    const regel_erklaerung = !freigeschaltet
      ? regelZuText(slot.freigeschaltet_wenn, ctx, 'Nicht freigeschaltet')
      : pflichtByRegel
        ? regelZuText(slot.pflicht_wenn, ctx, 'Pflicht')
        : slot.pflicht_wenn == null
          ? 'Optional (kein Pflicht-Trigger im Katalog)'
          : regelZuText(slot.pflicht_wenn, ctx, 'Optional — Pflicht-Regel nicht erfüllt')

    entries.push({
      slot_id: slot.slot_id,
      label: slot.label,
      kategorie: slot.kategorie as string,
      beschreibung: slot.beschreibung,
      freigeschaltet,
      pflicht: pflichtByRegel,
      status,
      regel_erklaerung,
      freigeschaltet_wenn: slot.freigeschaltet_wenn,
      pflicht_wenn: slot.pflicht_wenn,
      pflicht_row_id: row?.id ?? null,
      inkonsistenz,
    })
  }

  return entries
}

/**
 * Gruppiert die Matrix nach Kategorie und sortiert Einträge stabil:
 * Pflicht > Optional-freigeschaltet > Nicht-freigeschaltet.
 */
export function gruppiereMatrix(
  entries: PflichtDocMatrixEntry[],
): Array<{ kategorie: string; entries: PflichtDocMatrixEntry[] }> {
  const groups = new Map<string, PflichtDocMatrixEntry[]>()
  for (const e of entries) {
    const g = groups.get(e.kategorie) ?? []
    g.push(e)
    groups.set(e.kategorie, g)
  }

  const rank = (e: PflichtDocMatrixEntry): number => {
    if (!e.freigeschaltet) return 2
    if (e.pflicht) return 0
    return 1
  }
  const result: Array<{ kategorie: string; entries: PflichtDocMatrixEntry[] }> = []
  for (const [kategorie, list] of groups.entries()) {
    list.sort((a, b) => {
      const r = rank(a) - rank(b)
      if (r !== 0) return r
      return a.label.localeCompare(b.label, 'de')
    })
    result.push({ kategorie, entries: list })
  }
  return result
}
