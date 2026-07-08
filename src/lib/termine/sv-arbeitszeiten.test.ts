import { describe, it, expect } from 'vitest'
import { svWochentagArbeitszeit } from './sv-arbeitszeiten'

describe('svWochentagArbeitszeit', () => {
  it('arbeitszeiten=null -> Default (Mo 09:00-17:00)', () => {
    expect(svWochentagArbeitszeit(null, null, 1)).toEqual({ von: '09:00', bis: '17:00' })
  })

  it('arbeitszeiten=null -> Fr 09:00-16:00 (Default weicht Fr ab)', () => {
    expect(svWochentagArbeitszeit(null, null, 5)).toEqual({ von: '09:00', bis: '16:00' })
  })

  it('Default: Sa/So haben keinen Eintrag -> null', () => {
    expect(svWochentagArbeitszeit(null, null, 6)).toBeNull() // Sa
    expect(svWochentagArbeitszeit(null, null, 0)).toBeNull() // So
  })

  it('blockierteWochentage ist ISO (1=Mo..7=So): Mo geblockt -> null', () => {
    expect(svWochentagArbeitszeit(null, [1], 1)).toBeNull() // dowJs 1 = Mo = ISO 1
  })

  it('blockierteWochentage: So (dowJs 0) = ISO 7 geblockt -> null', () => {
    // Sonderfall dowJs 0 -> ISO 7. Ohne Block waere So eh null (kein Default-Eintrag),
    // aber ein custom-So-Eintrag muss durch [7] geblockt werden:
    expect(svWochentagArbeitszeit({ so: { von: '10:00', bis: '14:00' } }, [7], 0)).toBeNull()
    expect(svWochentagArbeitszeit({ so: { von: '10:00', bis: '14:00' } }, null, 0)).toEqual({ von: '10:00', bis: '14:00' })
  })

  it('custom arbeitszeiten ersetzt Default vollstaendig (kein Merge)', () => {
    const custom = { mo: { von: '08:00', bis: '12:00' } }
    expect(svWochentagArbeitszeit(custom, null, 1)).toEqual({ von: '08:00', bis: '12:00' }) // Mo custom
    expect(svWochentagArbeitszeit(custom, null, 2)).toBeNull() // Di: kein custom-Eintrag -> null (nicht Default)
  })
})
