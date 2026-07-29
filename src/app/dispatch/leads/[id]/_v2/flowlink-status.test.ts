import { describe, it, expect } from 'vitest'
import { effektiverFlowlinkStatus } from './flowlink-status'

const base = {
  status: 'erstellt',
  expires_at: '2026-08-01T00:00:00Z',
  geoeffnet_am: null,
  abgeschlossen_am: null,
}
const vorAblauf = new Date('2026-07-20T12:00:00Z')
const nachAblauf = new Date('2026-08-02T12:00:00Z')

describe('effektiverFlowlinkStatus', () => {
  it('abgeschlossen hat Vorrang vor allem', () => {
    expect(
      effektiverFlowlinkStatus({ ...base, abgeschlossen_am: '2026-07-19T10:00:00Z', geoeffnet_am: '2026-07-19T09:00:00Z' }, nachAblauf),
    ).toBe('abgeschlossen')
  })

  it('geoeffnet vor dem Roh-Status', () => {
    expect(effektiverFlowlinkStatus({ ...base, geoeffnet_am: '2026-07-19T09:00:00Z' }, vorAblauf)).toBe('geoeffnet')
  })

  // Audit-Befund: 'abgelaufen' wird nie in die DB geschrieben — die Anzeige muss
  // den Ablauf aus expires_at ableiten, sonst steht dort roh "erstellt".
  it('leitet abgelaufen aus expires_at ab (nie geoeffneter Link)', () => {
    expect(effektiverFlowlinkStatus(base, nachAblauf)).toBe('abgelaufen')
  })

  it('zeigt erstellt, solange der Link noch gueltig ist', () => {
    expect(effektiverFlowlinkStatus(base, vorAblauf)).toBe('erstellt')
  })

  it('storniert hat Vorrang vor dem Zeitablauf (bewusste Handlung > Ablauf)', () => {
    expect(effektiverFlowlinkStatus({ ...base, status: 'storniert' }, nachAblauf)).toBe('storniert')
  })
})
