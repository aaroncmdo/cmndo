// src/lib/self-service/__tests__/disqualifikation-patch.test.ts
import { describe, it, expect } from 'vitest'
import { buildDisqualifikationPatch, DISQUALIFIKATION_GRUND_TEXT } from '../disqualifikation-patch'

describe('buildDisqualifikationPatch', () => {
  it('werkstattbindung: Grund-Key, Text, Status und Zeitstempel', () => {
    expect(buildDisqualifikationPatch('werkstattbindung', '2026-09-04T10:00:00.000Z')).toEqual({
      disqualifiziert: true,
      disqualifiziert_am: '2026-09-04T10:00:00.000Z',
      disqualifiziert_grund_key: 'werkstattbindung',
      disqualifiziert_grund: DISQUALIFIKATION_GRUND_TEXT.werkstattbindung,
      status: 'disqualifiziert',
    })
  })
  it('eigenverschulden bleibt der bisherige Text', () => {
    expect(buildDisqualifikationPatch('eigenverschulden', 'x').disqualifiziert_grund).toContain('Eigenverschulden')
    expect(DISQUALIFIKATION_GRUND_TEXT.werkstattbindung).toContain('Werkstattbindung')
  })
})
