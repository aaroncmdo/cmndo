// AAR-322: JSON-Rule-DSL Evaluator für dokument_katalog.
// Rule-Format siehe Migration aar_321_dokument_katalog_seed.
//
// AAR-542 (C5): Erweitert um gt/lt/gte/lte + is_null/is_not_null — die
// JSON-Schema-Erweiterung des Epics AAR-537. Leeres Objekt `{}` wird als
// „immer wahr" akzeptiert (entspricht sv_sa_vorlage-Seed).
//
// Kontext-Keys: Wir flachen Lead + Fall in einen Object mit Prefix-Keys
// ("lead.col" / "fall.col"). Seeds referenzieren Felder explizit mit
// Prefix, damit das gleiche Feld auf leads + faelle unterschiedliche
// Werte haben kann (z.B. zeugen_vorhanden auf beiden Tabellen).

export type Rule =
  | { op: 'eq'; field: string; value: string | number | boolean | null }
  | { op: 'neq'; field: string; value: string | number | boolean | null }
  | { op: 'in'; field: string; value: Array<string | number | boolean> }
  | { op: 'not_in'; field: string; value: Array<string | number | boolean> }
  | { op: 'gt'; field: string; value: number }
  | { op: 'lt'; field: string; value: number }
  | { op: 'gte'; field: string; value: number }
  | { op: 'lte'; field: string; value: number }
  | { op: 'is_null'; field: string }
  | { op: 'is_not_null'; field: string }
  | { op: 'truthy'; field: string }
  | { op: 'falsy'; field: string }
  | { op: 'and'; conditions: Rule[] }
  | { op: 'or'; conditions: Rule[] }
  | { op: 'not'; condition: Rule }

export type EvalContext = Record<string, unknown>

/**
 * Wertet eine JSON-Rule gegen einen Lead/Fall-Kontext aus.
 * Null/undefined → true (keine Einschränkung).
 * Unbekanntes Feld → undefined → bei eq/in stets false, bei falsy true.
 */
export function evaluateKatalogRule(
  rule: Rule | null | undefined,
  context: EvalContext,
): boolean {
  if (rule == null) return true
  // AAR-542: Leeres Objekt aus JSONB = „immer wahr" (wird so aus dem
  // Katalog-Seed geliefert, z. B. sv_sa_vorlage).
  if (typeof rule === 'object' && !('op' in (rule as Record<string, unknown>))) {
    return true
  }

  switch (rule.op) {
    case 'eq':
      return equals(context[rule.field], rule.value)
    case 'neq':
      return !equals(context[rule.field], rule.value)
    case 'in': {
      const v = context[rule.field]
      if (v == null) return false
      return rule.value.some((candidate) => equals(v, candidate))
    }
    case 'not_in': {
      const v = context[rule.field]
      if (v == null) return true
      return !rule.value.some((candidate) => equals(v, candidate))
    }
    case 'gt': {
      const n = toNumber(context[rule.field])
      return n != null && n > rule.value
    }
    case 'lt': {
      const n = toNumber(context[rule.field])
      return n != null && n < rule.value
    }
    case 'gte': {
      const n = toNumber(context[rule.field])
      return n != null && n >= rule.value
    }
    case 'lte': {
      const n = toNumber(context[rule.field])
      return n != null && n <= rule.value
    }
    case 'is_null':
      return context[rule.field] == null
    case 'is_not_null':
      return context[rule.field] != null
    case 'truthy':
      return isTruthy(context[rule.field])
    case 'falsy':
      return !isTruthy(context[rule.field])
    case 'and':
      return rule.conditions.every((c) => evaluateKatalogRule(c, context))
    case 'or':
      return rule.conditions.some((c) => evaluateKatalogRule(c, context))
    case 'not':
      return !evaluateKatalogRule(rule.condition, context)
    default: {
      // Unbekannter Operator — defensiv false, damit neue DSL-Features
      // nicht still als "true" rutschen
      return false
    }
  }
}

function toNumber(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v
  if (typeof v === 'string' && v.trim().length > 0) {
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }
  return null
}

function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true
  // null/undefined als gleich behandeln (DB liefert mal null, mal undefined)
  if (a == null && b == null) return true
  if (a == null || b == null) return false
  // Primitive-Coercion nur wenn beide Strings-oder-Numbers sind
  if ((typeof a === 'number' && typeof b === 'string') ||
      (typeof a === 'string' && typeof b === 'number')) {
    return String(a) === String(b)
  }
  return false
}

function isTruthy(v: unknown): boolean {
  if (v == null) return false
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v !== 0
  if (typeof v === 'string') return v.length > 0
  if (Array.isArray(v)) return v.length > 0
  return true
}

/**
 * Baut den EvalContext aus Lead- und Fall-Daten mit Prefix-Keys
 * ("lead.col", "fall.col"). Beide Quellen parallel — keine Überschreibung.
 */
export function buildKatalogContext(args: {
  lead?: Record<string, unknown> | null
  fall?: Record<string, unknown> | null
}): EvalContext {
  const ctx: EvalContext = {}
  if (args.lead) {
    for (const [key, value] of Object.entries(args.lead)) {
      ctx[`lead.${key}`] = value
    }
  }
  if (args.fall) {
    for (const [key, value] of Object.entries(args.fall)) {
      ctx[`fall.${key}`] = value
    }
  }
  return ctx
}
