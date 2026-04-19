import { describe, it, expect } from 'vitest'
import {
  evaluateKatalogRule,
  buildKatalogContext,
  type Rule,
  type EvalContext,
} from './ruleEvaluator'

describe('evaluateKatalogRule', () => {
  const ctx: EvalContext = {
    'lead.personenschaden_flag': true,
    'lead.polizei_vor_ort': false,
    'lead.service_typ': 'komplett',
    'lead.zb1_status': 'offen',
    'fall.technische_stellungnahme_status': 'beauftragt',
    'lead.gegner_anzahl_beteiligte': 2,
    'lead.empty_string': '',
    'lead.null_field': null,
  }

  it('null-rule → true (immer freigeschaltet)', () => {
    expect(evaluateKatalogRule(null, ctx)).toBe(true)
    expect(evaluateKatalogRule(undefined, ctx)).toBe(true)
  })

  it('eq: true-match', () => {
    const rule: Rule = { op: 'eq', field: 'lead.personenschaden_flag', value: true }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('eq: false-match', () => {
    const rule: Rule = { op: 'eq', field: 'lead.polizei_vor_ort', value: true }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('eq: unbekanntes Feld → false', () => {
    const rule: Rule = { op: 'eq', field: 'lead.nicht_existiert', value: true }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('neq: true wenn Werte unterschiedlich', () => {
    const rule: Rule = { op: 'neq', field: 'lead.service_typ', value: 'nur_gutachter' }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('in: value in Liste', () => {
    const rule: Rule = {
      op: 'in',
      field: 'fall.technische_stellungnahme_status',
      value: ['beauftragt', 'in-bearbeitung', 'abgeschlossen'],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('in: value nicht in Liste', () => {
    const rule: Rule = {
      op: 'in',
      field: 'lead.zb1_status',
      value: ['bestaetigt', 'hochgeladen'],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('not_in: value nicht in Liste → true', () => {
    const rule: Rule = {
      op: 'not_in',
      field: 'lead.zb1_status',
      value: ['bestaetigt', 'hochgeladen'],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('not_in: null-Feld → true (ohne Wert nicht in Liste)', () => {
    const rule: Rule = { op: 'not_in', field: 'lead.null_field', value: ['a', 'b'] }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('truthy / falsy', () => {
    expect(evaluateKatalogRule({ op: 'truthy', field: 'lead.personenschaden_flag' }, ctx)).toBe(true)
    expect(evaluateKatalogRule({ op: 'truthy', field: 'lead.polizei_vor_ort' }, ctx)).toBe(false)
    expect(evaluateKatalogRule({ op: 'falsy', field: 'lead.empty_string' }, ctx)).toBe(true)
    expect(evaluateKatalogRule({ op: 'falsy', field: 'lead.null_field' }, ctx)).toBe(true)
  })

  it('and: alle true → true', () => {
    const rule: Rule = {
      op: 'and',
      conditions: [
        { op: 'eq', field: 'lead.service_typ', value: 'komplett' },
        { op: 'eq', field: 'lead.personenschaden_flag', value: true },
      ],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('and: einer false → false', () => {
    const rule: Rule = {
      op: 'and',
      conditions: [
        { op: 'eq', field: 'lead.service_typ', value: 'komplett' },
        { op: 'eq', field: 'lead.polizei_vor_ort', value: true },
      ],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('or: einer true → true', () => {
    const rule: Rule = {
      op: 'or',
      conditions: [
        { op: 'eq', field: 'lead.polizei_vor_ort', value: true },
        { op: 'eq', field: 'lead.personenschaden_flag', value: true },
      ],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('or: alle false → false', () => {
    const rule: Rule = {
      op: 'or',
      conditions: [
        { op: 'eq', field: 'lead.polizei_vor_ort', value: true },
        { op: 'eq', field: 'lead.zb1_status', value: 'bestaetigt' },
      ],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('not: flippt inner Rule', () => {
    const rule: Rule = {
      op: 'not',
      condition: { op: 'eq', field: 'lead.personenschaden_flag', value: true },
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(false)
  })

  it('verschachtelte and/or', () => {
    const rule: Rule = {
      op: 'and',
      conditions: [
        { op: 'eq', field: 'lead.service_typ', value: 'komplett' },
        {
          op: 'or',
          conditions: [
            { op: 'eq', field: 'lead.polizei_vor_ort', value: true },
            { op: 'eq', field: 'lead.personenschaden_flag', value: true },
          ],
        },
      ],
    }
    expect(evaluateKatalogRule(rule, ctx)).toBe(true)
  })

  it('number/string coercion für eq', () => {
    const ctx2: EvalContext = { 'lead.anzahl': 2 }
    expect(evaluateKatalogRule({ op: 'eq', field: 'lead.anzahl', value: '2' }, ctx2)).toBe(true)
    expect(evaluateKatalogRule({ op: 'eq', field: 'lead.anzahl', value: 2 }, ctx2)).toBe(true)
  })

  // AAR-542 (C5): neue Operatoren aus dem erweiterten JSONB-Schema
  describe('AAR-542 — numerische und Null-Checks', () => {
    const numCtx: EvalContext = {
      'lead.gegner_anzahl_beteiligte': 3,
      'lead.kilometerstand_string': '125000',
      'lead.zb1_status': null,
      'fall.abschlepp_kosten': 0,
      'fall.schaden_summe': 12500,
    }

    it('gt: numerischer Vergleich', () => {
      expect(evaluateKatalogRule({ op: 'gt', field: 'lead.gegner_anzahl_beteiligte', value: 2 }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'gt', field: 'lead.gegner_anzahl_beteiligte', value: 3 }, numCtx)).toBe(false)
    })

    it('lt: numerischer Vergleich', () => {
      expect(evaluateKatalogRule({ op: 'lt', field: 'fall.abschlepp_kosten', value: 100 }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'lt', field: 'fall.schaden_summe', value: 100 }, numCtx)).toBe(false)
    })

    it('gte / lte: inklusive Grenzen', () => {
      expect(evaluateKatalogRule({ op: 'gte', field: 'lead.gegner_anzahl_beteiligte', value: 3 }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'lte', field: 'fall.schaden_summe', value: 12500 }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'lte', field: 'fall.schaden_summe', value: 12499 }, numCtx)).toBe(false)
    })

    it('gt: akzeptiert numerischen String', () => {
      expect(evaluateKatalogRule({ op: 'gt', field: 'lead.kilometerstand_string', value: 100000 }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'gt', field: 'lead.kilometerstand_string', value: 200000 }, numCtx)).toBe(false)
    })

    it('gt / lt mit fehlendem Feld → false', () => {
      expect(evaluateKatalogRule({ op: 'gt', field: 'lead.nicht_existiert', value: 0 }, numCtx)).toBe(false)
      expect(evaluateKatalogRule({ op: 'lt', field: 'lead.zb1_status', value: 0 }, numCtx)).toBe(false)
    })

    it('is_null: null-Feld → true, Wert-Feld → false', () => {
      expect(evaluateKatalogRule({ op: 'is_null', field: 'lead.zb1_status' }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'is_null', field: 'lead.gegner_anzahl_beteiligte' }, numCtx)).toBe(false)
    })

    it('is_not_null: Wert → true, null → false', () => {
      expect(evaluateKatalogRule({ op: 'is_not_null', field: 'fall.schaden_summe' }, numCtx)).toBe(true)
      expect(evaluateKatalogRule({ op: 'is_not_null', field: 'lead.zb1_status' }, numCtx)).toBe(false)
      expect(evaluateKatalogRule({ op: 'is_not_null', field: 'lead.fehlendes_feld' }, numCtx)).toBe(false)
    })

    it('leeres Objekt {} → true (sv_sa_vorlage-Pattern)', () => {
      // JSONB kann `{}` liefern — wird als „immer wahr" behandelt.
      expect(evaluateKatalogRule({} as unknown as Rule, numCtx)).toBe(true)
    })
  })
})

describe('buildKatalogContext', () => {
  it('prefixt lead und fall mit Punkt-Notation', () => {
    const ctx = buildKatalogContext({
      lead: { personenschaden_flag: true, polizei_vor_ort: false },
      fall: { status: 'sv-termin' },
    })
    expect(ctx['lead.personenschaden_flag']).toBe(true)
    expect(ctx['lead.polizei_vor_ort']).toBe(false)
    expect(ctx['fall.status']).toBe('sv-termin')
  })

  it('null-Lead und null-Fall → leerer Kontext', () => {
    const ctx = buildKatalogContext({ lead: null, fall: null })
    expect(Object.keys(ctx)).toHaveLength(0)
  })
})
