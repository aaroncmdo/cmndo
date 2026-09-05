// src/lib/self-service/__tests__/disqualifikation-patch.test.ts
import { describe, it, expect } from 'vitest'
import { buildDisqualifikationPatch, buildReQualifikationPatch, DISQUALIFIKATION_GRUND_TEXT } from '../disqualifikation-patch'

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

describe('buildReQualifikationPatch', () => {
  it('hebt die Disqualifikation vollstaendig auf und setzt status=neu', () => {
    expect(buildReQualifikationPatch()).toEqual({
      disqualifiziert: false,
      disqualifiziert_am: null,
      disqualifiziert_grund_key: null,
      disqualifiziert_grund: null,
      status: 'neu',
    })
  })
  it('konvertierter Lead: status=umgewandelt statt neu (laufender Vorgang taucht nicht als neuer Lead auf)', () => {
    expect(buildReQualifikationPatch({ konvertiert: true }).status).toBe('umgewandelt')
    expect(buildReQualifikationPatch({ konvertiert: false }).status).toBe('neu')
  })
})
