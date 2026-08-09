import { describe, it, expect } from 'vitest'
import { istHervorgehobenerPartner } from '../partner-pin'

describe('istHervorgehobenerPartner', () => {
  it('imNetzwerk=true -> hervorgehoben', () => {
    expect(istHervorgehobenerPartner({ imNetzwerk: true })).toBe(true)
  })

  it('imNetzwerk false/undefined/null -> nicht hervorgehoben', () => {
    expect(istHervorgehobenerPartner({ imNetzwerk: false })).toBe(false)
    expect(istHervorgehobenerPartner({})).toBe(false)
    expect(istHervorgehobenerPartner({ imNetzwerk: null })).toBe(false)
  })

  // Aarons Kernbedingung: das globale "zahlender Netzwerkpartner"-Flag (istNetzwerkpartner)
  // darf die Karte NICHT highlighten — nur der relationale imNetzwerk-Flag zaehlt. Ein SV,
  // der global zahlt aber NICHT im Netzwerk des Owners ist, bleibt neutral.
  it('globaler Partner ohne Owner-Beziehung (imNetzwerk=false) -> NICHT hervorgehoben', () => {
    expect(istHervorgehobenerPartner({ imNetzwerk: false })).toBe(false)
  })
})
