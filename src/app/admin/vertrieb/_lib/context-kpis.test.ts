// context-kpis.test.ts
import { describe, it, expect } from 'vitest'
import { computeContextKpis } from './context-kpis'
import type { VertriebKontakt } from '@/lib/vertrieb/vertrieb-kontakt.types'

const k = (p: Partial<VertriebKontakt>): VertriebKontakt => ({
  id: 'x', kind: 'partner-lead', name: 'A', email: null, telefon: null, plz: null, ort: null,
  lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null, roh_status: null,
  roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null, roh_portal_zugang: null,
  roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  stufe: 'neu', typ: 'lead', rolle: 'werkstatt', ...p,
})

describe('computeContextKpis', () => {
  it('zählt bei "alle" global über alle Rollen', () => {
    const rows = [k({ typ: 'lead', stufe: 'neu' }), k({ typ: 'partner', stufe: 'aktiv', rolle: 'sv' })]
    const kpis = computeContextKpis(rows, 'alle')
    expect(kpis.find((x) => x.label === 'Leads')?.wert).toBe(1)
    expect(kpis.find((x) => x.label === 'Aktiv')?.wert).toBe(1)
  })
  it('scopet bei Rolle-Pill auf diese Rolle', () => {
    const rows = [k({ rolle: 'sv', stufe: 'aktiv', typ: 'partner' }), k({ rolle: 'werkstatt', stufe: 'aktiv', typ: 'partner' })]
    const kpis = computeContextKpis(rows, 'sv')
    expect(kpis.find((x) => x.label === 'Aktiv')?.wert).toBe(1)
  })
})
