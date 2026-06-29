import { describe, it, expect } from 'vitest'
import {
  MANDATORY_QC_FIELDS,
  QC_FIELD_LABELS,
  fehlendeQcFelder,
  qcChecklisteVollstaendig,
  type QcCheckValues,
} from './checkliste-validation'

function alleWahr(): QcCheckValues {
  const o: QcCheckValues = {}
  for (const f of MANDATORY_QC_FIELDS) o[f] = true
  return o
}

describe('qcChecklisteVollstaendig', () => {
  it('alle Pflicht-Checks true -> vollstaendig', () => {
    expect(qcChecklisteVollstaendig(alleWahr())).toBe(true)
    expect(fehlendeQcFelder(alleWahr())).toEqual([])
  })

  it('ein Check false -> nicht vollstaendig, listet genau dieses Feld', () => {
    const checks = { ...alleWahr(), fotos_ausreichend: false }
    expect(qcChecklisteVollstaendig(checks)).toBe(false)
    expect(fehlendeQcFelder(checks)).toEqual(['fotos_ausreichend'])
  })

  it('ein Check null (ungeprueft) zaehlt als nicht erfuellt', () => {
    const checks = { ...alleWahr(), vollmacht_vorhanden: null }
    expect(qcChecklisteVollstaendig(checks)).toBe(false)
    expect(fehlendeQcFelder(checks)).toContain('vollmacht_vorhanden')
  })

  it('fehlender Key (undefined) zaehlt als nicht erfuellt', () => {
    const checks = alleWahr()
    delete checks.fin_17_zeichen
    expect(qcChecklisteVollstaendig(checks)).toBe(false)
    expect(fehlendeQcFelder(checks)).toContain('fin_17_zeichen')
  })

  it('leeres Objekt -> alle Felder fehlen', () => {
    expect(qcChecklisteVollstaendig({})).toBe(false)
    expect(fehlendeQcFelder({})).toEqual([...MANDATORY_QC_FIELDS])
  })

  it('jedes Pflichtfeld hat ein deutsches Label (mit Umlaut wo noetig)', () => {
    for (const f of MANDATORY_QC_FIELDS) {
      expect(QC_FIELD_LABELS[f]).toBeTruthy()
    }
    // Stichprobe: Umlaut-Korrektheit (kein ae/oe/ue-Ersatz)
    expect(QC_FIELD_LABELS.gutachten_vollstaendig).toContain('ä')
    expect(QC_FIELD_LABELS.vorschaeden_beruecksichtigt).toContain('ü')
  })
})
