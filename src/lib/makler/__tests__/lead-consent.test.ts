import { describe, it, expect } from 'vitest'
import { joinLeadsMitConsent, type LeadBasis, type ClaimRef, type ConsentRef } from '../lead-consent'

const lead = (id: string, extra: Partial<LeadBasis> = {}): LeadBasis => ({
  id,
  vorname: 'Max',
  nachname: 'Muster',
  fahrzeug_hersteller: null,
  fahrzeug_modell: null,
  unfalldatum: null,
  status: 'neu',
  created_at: '2026-07-01T00:00:00Z',
  disqualifiziert: null,
  ...extra,
})
const claim = (id: string, leadId: string, service_typ: string | null = 'komplett'): ClaimRef => ({ id, lead_id: leadId, service_typ })
const consent = (claimId: string, scope: string | null, widerrufen_am: string | null = null): ConsentRef => ({
  claim_id: claimId,
  fall_id: claimId, // bridge: fall_id == claim_id
  consent_scope: scope,
  widerrufen_am,
})

describe('joinLeadsMitConsent', () => {
  it('mappt vollzugriff inkl. fall_id + service_typ', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [claim('C1', 'L1')], [consent('C1', 'vollzugriff')])
    expect(row).toMatchObject({ id: 'L1', fall_id: 'C1', fall_service_typ: 'komplett', consent_label: 'vollzugriff' })
  })

  it('mappt minimal', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [claim('C1', 'L1')], [consent('C1', 'minimal')])
    expect(row.consent_label).toBe('minimal')
  })

  it('widerrufener Consent schlaegt den scope', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [claim('C1', 'L1')], [consent('C1', 'vollzugriff', '2026-07-02T00:00:00Z')])
    expect(row.consent_label).toBe('widerrufen')
  })

  it('Claim ohne Consent-Zeile → kein_account, Akte-Link bleibt aufloesbar', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [claim('C1', 'L1')], [])
    expect(row).toMatchObject({ consent_label: 'kein_account', fall_id: 'C1', fall_service_typ: 'komplett' })
  })

  it('Lead ohne Claim → kein_account, kein fall', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [], [])
    expect(row).toMatchObject({ consent_label: 'kein_account', fall_id: null, fall_service_typ: null })
  })

  it('Consent eines FREMDEN Claims faerbt den Lead nicht ein', () => {
    const [row] = joinLeadsMitConsent([lead('L1')], [claim('C1', 'L1')], [consent('C2', 'vollzugriff')])
    expect(row.consent_label).toBe('kein_account')
  })

  it('behaelt Reihenfolge + Lead-Felder bei', () => {
    const rows = joinLeadsMitConsent([lead('L1'), lead('L2', { status: 'umgewandelt' })], [claim('C2', 'L2')], [consent('C2', 'minimal')])
    expect(rows.map((r) => r.id)).toEqual(['L1', 'L2'])
    expect(rows[1]).toMatchObject({ status: 'umgewandelt', consent_label: 'minimal' })
  })
})
