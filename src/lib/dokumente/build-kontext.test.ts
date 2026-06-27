import { describe, it, expect } from 'vitest'
import { buildDokumentKontext } from './build-kontext'

describe('buildDokumentKontext', () => {
  it('mappt Claim-SSoT auf Katalog-Regel-Keys', () => {
    const ctx = buildDokumentKontext({
      claim: { hat_personenschaden: true, halter_ungleich_fahrer: true, polizei_vor_ort: false, fahrerflucht: true, finanzierung_leasing: 'leasing' },
      lead: { zb1_status: 'offen' },
    })
    expect(ctx['lead.personenschaden_flag']).toBe(true)
    expect(ctx['lead.halter_ungleich_fahrer_flag']).toBe(true)
    expect(ctx['lead.fahrerflucht']).toBe(true)
    expect(ctx['lead.finanzierung_leasing']).toBe('leasing')
    expect(ctx['lead.zb1_status']).toBe('offen')
  })
  it('Claim gewinnt vor Lead bei Konflikt', () => {
    const ctx = buildDokumentKontext({ claim: { hat_sachschaden: true }, lead: { sachschaden_flag: false } })
    expect(ctx['lead.sachschaden_flag']).toBe(true)
  })
})
