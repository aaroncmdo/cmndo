import { describe, it, expect } from 'vitest'
import { effektiveBezugIds } from '../effektive-bezug-ids'

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
