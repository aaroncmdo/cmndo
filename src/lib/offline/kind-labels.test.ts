import { describe, it, expect } from 'vitest'
import { offlineKindLabel } from './kind-labels'

describe('offlineKindLabel', () => {
  it('mappt bekannte Kinds auf nutzer-sichtbare Labels', () => {
    expect(offlineKindLabel('flow_stammdaten')).toBe('Kontaktdaten')
    expect(offlineKindLabel('werkstatt_lead_edit')).toBe('Werkstatt-Anfrage')
    expect(offlineKindLabel('flow_zb1_upload')).toBe('Fahrzeugschein-Foto')
    expect(offlineKindLabel('fall_dokument_upload')).toBe('Dokument-Upload')
  })
  it('fällt für unbekannte Kinds auf einen generischen Label zurück', () => {
    expect(offlineKindLabel('irgendwas_neues')).toBe('Offline-Eintrag')
  })
})
