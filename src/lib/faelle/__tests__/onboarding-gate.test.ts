import { describe, it, expect } from 'vitest'
import { kundeHatBestaetigt } from '../onboarding-gate'

describe('kundeHatBestaetigt (P4-Gate)', () => {
  it('sa_unterschrieben=true -> true', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: true })).toBe(true)
  })
  it('sa_unterschrieben=false -> false', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: false })).toBe(false)
  })
  it('null/undefined -> false (konservativ)', () => {
    expect(kundeHatBestaetigt({ sa_unterschrieben: null })).toBe(false)
    expect(kundeHatBestaetigt({ sa_unterschrieben: undefined })).toBe(false)
    expect(kundeHatBestaetigt({})).toBe(false)
  })

  // Ops-Test 12.08. (Aaron-Entscheid): Im SV-Vermittlungsfall hat der Sachverstaendige
  // die SA bereits OFFLINE eingeholt — eine zweite digitale Unterschrift ist sinnlos
  // und blockierte die Werkstatt-Vermittlung komplett. Das externe Signal zaehlt daher
  // als Bestaetigung.
  describe('externe SA-Bestaetigung (offline vom SV eingeholt)', () => {
    it('sa_extern_bestaetigt_am gesetzt -> true, auch ohne digitale Unterschrift', () => {
      expect(
        kundeHatBestaetigt({ sa_unterschrieben: false, sa_extern_bestaetigt_am: '2026-08-12T08:30:00Z' }),
      ).toBe(true)
    })

    it('sa_extern_bestaetigt_am null -> unveraendert false', () => {
      expect(kundeHatBestaetigt({ sa_unterschrieben: false, sa_extern_bestaetigt_am: null })).toBe(false)
    })

    // Wichtig fuer die anderen beiden Consumer (filmcheck, autoPhase): sie laden das
    // Feld NICHT — ohne es muss sich das Gate exakt wie bisher verhalten.
    it('Feld gar nicht uebergeben -> Verhalten unveraendert', () => {
      expect(kundeHatBestaetigt({ sa_unterschrieben: false })).toBe(false)
      expect(kundeHatBestaetigt({ sa_unterschrieben: true })).toBe(true)
    })
  })
})
