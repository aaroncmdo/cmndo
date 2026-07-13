// Vertrieb-CRM P4: Contract-Test — filterGegenBestand erkennt einen Bestands-PARTNER als
// Dublette (nicht nur Leads). Die pure istDublette/filterGegenBestand ist generisch; dieser
// Test sichert, dass Partner-Zeilen im Bestand denselben Dedup-Effekt haben wie Leads.
import { describe, it, expect } from 'vitest'
import { filterGegenBestand, type ScrapeKandidat, type BestandsLead } from '@/lib/partner/scraping'

const kandidat = (p: Partial<ScrapeKandidat>): ScrapeKandidat => ({
  google_place_id: 'X',
  firma: 'Test GmbH',
  telefon: null,
  website: null,
  strasse: null,
  plz: null,
  ort: null,
  formatted_address: '',
  ...p,
})

describe('filterGegenBestand — Cross-Table (Partner im Bestand)', () => {
  it('erkennt einen Bestands-Partner per place_id als Dublette', () => {
    const partner: BestandsLead[] = [{ google_place_id: 'P1', firma: 'X', telefon: null, plz: '50667' }]
    const { neu, dubletten } = filterGegenBestand([kandidat({ google_place_id: 'P1' })], partner)
    expect(neu).toHaveLength(0)
    expect(dubletten).toHaveLength(1)
  })

  it('erkennt Bestands-Partner per Firma+PLZ (ohne place_id)', () => {
    const partner: BestandsLead[] = [{ google_place_id: null, firma: 'Autohaus Müller', telefon: null, plz: '50667' }]
    const { neu, dubletten } = filterGegenBestand(
      [kandidat({ google_place_id: 'neu-1', firma: 'Autohaus  Müller', plz: '50667' })],
      partner,
    )
    // normalisiereFirma reduziert auf alphanumerischen Kern -> "Autohaus Müller" == "Autohaus  Müller".
    expect(dubletten).toHaveLength(1)
    expect(neu).toHaveLength(0)
  })

  it('laesst einen echten Neuzugang durch', () => {
    const partner: BestandsLead[] = [{ google_place_id: 'P1', firma: 'X', telefon: '0221111', plz: '50667' }]
    const { neu } = filterGegenBestand([kandidat({ google_place_id: 'P2', firma: 'Ganz Anders', plz: '10115' })], partner)
    expect(neu).toHaveLength(1)
  })
})
