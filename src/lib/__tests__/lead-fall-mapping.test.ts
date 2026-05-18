// AAR-575/AAR-576: Unit-Tests für den Lead→Fall-Converter.
//
// Prüft dass die neu eingeführten Snapshot-Spalten (kunde_*, hsn, tsn)
// aus dem Lead beim Fall-Insert übernommen werden — inklusive der RENAMED-
// Logik (lead.vorname → fall.kunde_vorname).

import { describe, it, expect } from 'vitest'
import { buildFallInsertFromLead, type LeadRow, type BuildFallOptions } from '../lead-fall-mapping'

const OPTS: BuildFallOptions = {
  // CMM-44 SP-A3: fallNummer aus BuildFallOptions entfernt — claim_nummer
  // ist kanonisch (DB-Trigger), die alte faelle-Aktennummer entfaellt.
  kundenbetreuerId: null,
  svIdFromTermin: null,
  signatureUrl: 'https://example.invalid/sig.png',
}

describe('buildFallInsertFromLead — AAR-575/AAR-576 Snapshots', () => {
  it('AAR-576: übernimmt hsn + tsn aus dem Lead', () => {
    const lead: LeadRow = { id: 'lead-1', hsn: '0603', tsn: 'BFI' }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.hsn).toBe('0603')
    expect(insert.tsn).toBe('BFI')
  })

  it('AAR-576: fehlende hsn/tsn werden zu null', () => {
    const insert = buildFallInsertFromLead({ id: 'lead-2' }, OPTS)
    expect(insert.hsn).toBeNull()
    expect(insert.tsn).toBeNull()
  })

  it('AAR-575: Kunde-Identität kommt aus lead.vorname/nachname/email/telefon (RENAMED)', () => {
    const lead: LeadRow = {
      id: 'lead-3',
      vorname: 'Anna',
      nachname: 'Müller',
      email: 'anna@example.invalid',
      telefon: '+49 170 1234567',
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.kunde_vorname).toBe('Anna')
    expect(insert.kunde_nachname).toBe('Müller')
    expect(insert.kunde_email).toBe('anna@example.invalid')
    expect(insert.kunde_telefon).toBe('+49 170 1234567')
  })

  it('AAR-575: Kunde-Anschrift wird aus lead.kunde_* durchgereicht (DIRECT)', () => {
    const lead: LeadRow = {
      id: 'lead-4',
      ist_fahrzeughalter: false,
      kunde_strasse: 'Musterweg 12',
      kunde_plz: '50667',
      kunde_stadt: 'Köln',
      kunde_adresse: 'Musterweg 12, 50667 Köln',
      kunde_lat: 50.9375,
      kunde_lng: 6.9603,
    }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.kunde_strasse).toBe('Musterweg 12')
    expect(insert.kunde_plz).toBe('50667')
    expect(insert.kunde_stadt).toBe('Köln')
    expect(insert.kunde_adresse).toBe('Musterweg 12, 50667 Köln')
    expect(insert.kunde_lat).toBe(50.9375)
    expect(insert.kunde_lng).toBe(6.9603)
  })

  it('AAR-575: bei Halter=Kunde bleiben die kunde_*-Anschriftsfelder null', () => {
    const lead: LeadRow = { id: 'lead-5', ist_fahrzeughalter: true }
    const insert = buildFallInsertFromLead(lead, OPTS)
    expect(insert.kunde_strasse).toBeNull()
    expect(insert.kunde_plz).toBeNull()
    expect(insert.kunde_stadt).toBeNull()
  })
})
