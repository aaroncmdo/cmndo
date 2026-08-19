import { describe, it, expect } from 'vitest'
import { effektiveBezugIds, effektiveFallClaimId } from '../effektive-bezug-ids'

// Kontext: gutachter_termine hat zwei Bezug-Achsen — Legacy (fall_id/lead_id/claim_id)
// und kanonisch (bezug_typ/bezug_id). Die Engine (reserviere) schreibt bezug-nativ
// OHNE Legacy-Spalte (validate-Trigger-Falle). Consumer, die den Auftrag NUR ueber
// die Legacy-Spalten aufloesen, verfehlen bezug-native Termine. effektiveBezugIds
// liefert die effektive fall/lead/claim-Id mit Legacy-Vorrang + bezug-Fallback.

describe('effektiveBezugIds', () => {
  it('Legacy-Spalten haben Vorrang (bezug wird ignoriert wenn Legacy gesetzt)', () => {
    const r = effektiveBezugIds({
      fall_id: 'F1',
      lead_id: 'L1',
      claim_id: 'C1',
      bezug_typ: 'lead',
      bezug_id: 'L-OTHER',
    })
    expect(r).toEqual({ fallId: 'F1', leadId: 'L1', claimId: 'C1' })
  })

  it('pur-lead-bezug (nur bezug_typ=lead + bezug_id) → leadId aus bezug', () => {
    const r = effektiveBezugIds({
      fall_id: null,
      lead_id: null,
      claim_id: null,
      bezug_typ: 'lead',
      bezug_id: 'L1',
    })
    expect(r).toEqual({ fallId: null, leadId: 'L1', claimId: null })
  })

  it('pur-claim-bezug → claimId aus bezug', () => {
    const r = effektiveBezugIds({
      fall_id: null,
      lead_id: null,
      claim_id: null,
      bezug_typ: 'claim',
      bezug_id: 'C1',
    })
    expect(r).toEqual({ fallId: null, leadId: null, claimId: 'C1' })
  })

  it('pur-fall-bezug → fallId aus bezug', () => {
    const r = effektiveBezugIds({
      bezug_typ: 'fall',
      bezug_id: 'F1',
    })
    expect(r).toEqual({ fallId: 'F1', leadId: null, claimId: null })
  })

  it('konvertierter Lead: fall_id+claim_id gesetzt, lead_id NULL, bezug=lead → leadId aus bezug_id', () => {
    // Entspricht den 10 bestaetigt-Prod-Zeilen: has_fall, has_claim, lead_id NULL, bezug_typ=lead.
    const r = effektiveBezugIds({
      fall_id: 'F9',
      lead_id: null,
      claim_id: 'C9',
      bezug_typ: 'lead',
      bezug_id: 'L9',
    })
    expect(r).toEqual({ fallId: 'F9', leadId: 'L9', claimId: 'C9' })
  })

  it('bezug_typ gesetzt aber bezug_id NULL → kein Fallback (null)', () => {
    const r = effektiveBezugIds({
      fall_id: null,
      lead_id: null,
      claim_id: null,
      bezug_typ: 'lead',
      bezug_id: null,
    })
    expect(r).toEqual({ fallId: null, leadId: null, claimId: null })
  })

  it('nicht-selektierte Felder (undefined) werden als null behandelt', () => {
    const r = effektiveBezugIds({ fall_id: 'F1' })
    expect(r).toEqual({ fallId: 'F1', leadId: null, claimId: null })
  })

  it('komplett leer → alles null', () => {
    expect(effektiveBezugIds({})).toEqual({ fallId: null, leadId: null, claimId: null })
  })
})

// effektiveFallClaimId schliesst die Luecke zwischen den beiden Helpern:
// bezugOrExpr/bezugInExpr filtern ueber die Aequivalenzklasse bezug_typ.in.(fall,claim),
// effektiveBezugIds loest strikt pro Typ auf. Wer mit dem einen filtert und mit dem
// anderen zuordnet, wirft die neu gewonnenen Zeilen sofort wieder weg.
describe('effektiveFallClaimId — fall/claim-Aequivalenz', () => {
  it('bezug_typ=fall ohne Legacy-Spalte → liefert bezug_id (effektiveBezugIds.claimId waere hier NULL)', () => {
    const t = { fall_id: null, claim_id: null, bezug_typ: 'fall', bezug_id: 'X1' }
    expect(effektiveBezugIds(t).claimId).toBeNull() // genau die Falle
    expect(effektiveFallClaimId(t)).toBe('X1')
  })

  it('bezug_typ=claim ohne Legacy-Spalte → liefert bezug_id', () => {
    expect(effektiveFallClaimId({ bezug_typ: 'claim', bezug_id: 'X2' })).toBe('X2')
  })

  it('Legacy claim_id hat Vorrang', () => {
    expect(effektiveFallClaimId({ claim_id: 'C1', bezug_typ: 'fall', bezug_id: 'X3' })).toBe('C1')
  })

  it('Legacy fall_id zaehlt ebenfalls (fall_id == claims.id, dieselbe UUID)', () => {
    expect(effektiveFallClaimId({ fall_id: 'F1' })).toBe('F1')
  })

  it('reiner Lead-Termin → null (kein Fall/Claim-Bezug)', () => {
    expect(effektiveFallClaimId({ lead_id: 'L1', bezug_typ: 'lead', bezug_id: 'L1' })).toBeNull()
  })

  it('bezug_typ gesetzt, bezug_id NULL → null (kein Raten)', () => {
    expect(effektiveFallClaimId({ bezug_typ: 'fall', bezug_id: null })).toBeNull()
  })
})
