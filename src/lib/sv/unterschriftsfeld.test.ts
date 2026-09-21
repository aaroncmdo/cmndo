import { describe, it, expect } from 'vitest'
import {
  SIGNATUR_SLOTS,
  istSignaturSlot,
  validiereSignaturPosition,
  waehleSignaturKonfig,
  dokumentZustand,
} from './unterschriftsfeld'

// Aaron 20.09.2026: „ja aber das Unterschriftsfeld muss gesetzt werden." — Ein Gutachter lädt
// seine Kunden-Unterlagen ohne Vier-Augen hoch; das gesetzte Feld ist die einzige Sicherung,
// dass der Kunde AUF dem Dokument unterschreibt und nicht auf einer Anhang-Seite.

const A4 = { breite: 595, hoehe: 842, seiten: 2 }

describe('istSignaturSlot', () => {
  it('kennt genau die vier Kunden-Unterlagen, die der Kunde mit-signiert (Aaron 04.07.)', () => {
    expect([...SIGNATUR_SLOTS]).toEqual([
      'sv_sicherungsabtretung',
      'sv_honorarvereinbarung',
      'sv_datenschutzerklaerung',
      'sv_widerrufsbelehrung',
    ])
    expect(istSignaturSlot('sv_sicherungsabtretung')).toBe(true)
    expect(istSignaturSlot('sv_berufshaftpflicht')).toBe(false)
    expect(istSignaturSlot('sv_bvsk_mitgliedschaft')).toBe(false)
    expect(istSignaturSlot('irgendwas')).toBe(false)
  })
})

describe('validiereSignaturPosition', () => {
  it('nimmt ein Feld innerhalb der Seite an und rundet auf ganze PDF-Punkte', () => {
    const r = validiereSignaturPosition({ page: 1, x: 60.4, y: 100.6, width: 180, height: 60 }, A4)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.position).toMatchObject({ page: 1, x: 60, y: 101, width: 180, height: 60, pdf_breite: 595, pdf_hoehe: 842, seiten: 2 })
      expect(r.position.gesetzt_am).toMatch(/^\d{4}-\d{2}-\d{2}T/)
      expect(r.position.datum_x).toBeUndefined()
    }
  })
  it('übernimmt Datum- und Name-Position nur, wenn beide Koordinaten da sind', () => {
    const r = validiereSignaturPosition({ page: 0, x: 60, y: 100, width: 180, height: 60, datum_x: 60, datum_y: 180, name_x: 300 }, A4)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.position.datum_x).toBe(60)
      expect(r.position.datum_y).toBe(180)
      expect(r.position.name_x).toBeUndefined()
      expect(r.position.name_y).toBeUndefined()
    }
  })
  it('lehnt eine Seite ab, die das PDF nicht hat', () => {
    const r = validiereSignaturPosition({ page: 2, x: 60, y: 100, width: 180, height: 60 }, A4)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toMatch(/Seite/)
  })
  it('lehnt ein Feld ab, das aus der Seite herausragt oder keine Fläche hat', () => {
    expect(validiereSignaturPosition({ page: 0, x: 500, y: 100, width: 180, height: 60 }, A4).ok).toBe(false)
    expect(validiereSignaturPosition({ page: 0, x: -5, y: 100, width: 180, height: 60 }, A4).ok).toBe(false)
    expect(validiereSignaturPosition({ page: 0, x: 60, y: 800, width: 180, height: 60 }, A4).ok).toBe(false)
    expect(validiereSignaturPosition({ page: 0, x: 60, y: 100, width: 0, height: 60 }, A4).ok).toBe(false)
  })
  it('lehnt Unsinn ab (NaN, Strings, null)', () => {
    expect(validiereSignaturPosition(null, A4).ok).toBe(false)
    expect(validiereSignaturPosition({ page: 'a', x: 60, y: 100, width: 180, height: 60 }, A4).ok).toBe(false)
    expect(validiereSignaturPosition({ page: 0, x: Number.NaN, y: 100, width: 180, height: 60 }, A4).ok).toBe(false)
  })
})

describe('waehleSignaturKonfig', () => {
  const eigene = { page: 1, x: 10, y: 20, width: 100, height: 40, pdf_breite: 595, pdf_hoehe: 842, seiten: 2, gesetzt_am: '2026-09-20T16:00:00.000Z' }
  const global = { page: 0, x: 60, y: 100, width: 180, height: 60 }
  it('bevorzugt die Position des Gutachters vor der globalen Admin-Vorlage', () => {
    expect(waehleSignaturKonfig(eigene, global)).toMatchObject({ page: 1, x: 10, y: 20, width: 100, height: 40 })
  })
  it('fällt auf die globale Vorlage zurück, wenn der Gutachter keine gesetzt hat (Bestand, Annahme A1)', () => {
    expect(waehleSignaturKonfig(null, global)).toEqual(global)
    expect(waehleSignaturKonfig(undefined, global)).toEqual(global)
  })
  it('liefert null, wenn es weder das eine noch das andere gibt → Anhang-Seite', () => {
    expect(waehleSignaturKonfig(null, null)).toBeNull()
  })
  it('ignoriert eine kaputte gespeicherte Position statt sie anzuwenden', () => {
    expect(waehleSignaturKonfig({ page: 0, x: 'x' } as never, global)).toEqual(global)
  })
})

describe('dokumentZustand', () => {
  it('leer, wenn keine Datei da ist', () => {
    expect(dokumentZustand({ dokument_typ: 'sv_sicherungsabtretung', status: null, dokument_url: null, signatur_position: null })).toBe('leer')
    expect(dokumentZustand({ dokument_typ: 'sv_sicherungsabtretung', status: 'ausstehend', dokument_url: null, signatur_position: null })).toBe('leer')
  })
  it('feld_fehlt: Datei da, aber noch nicht aktiv, weil das Unterschriftsfeld fehlt (neuer Upload)', () => {
    expect(dokumentZustand({ dokument_typ: 'sv_sicherungsabtretung', status: 'ausstehend', dokument_url: 'sv-pflicht/x.pdf', signatur_position: null })).toBe('feld_fehlt')
  })
  it('aktiv_ohne_feld: Bestandsdokument, das bereits im Kundenflow ist, aber noch die Anhang-Seite bekommt (Annahme A1)', () => {
    expect(dokumentZustand({ dokument_typ: 'sv_datenschutzerklaerung', status: 'hochgeladen', dokument_url: 'sv-pflicht/x.pdf', signatur_position: null })).toBe('aktiv_ohne_feld')
  })
  it('aktiv: Feld gesetzt — oder ein Nachweis-Slot, der nie eines braucht', () => {
    expect(dokumentZustand({ dokument_typ: 'sv_sicherungsabtretung', status: 'hochgeladen', dokument_url: 'sv-pflicht/x.pdf', signatur_position: { page: 0 } })).toBe('aktiv')
    expect(dokumentZustand({ dokument_typ: 'sv_berufshaftpflicht', status: 'hochgeladen', dokument_url: 'sv-pflicht/x.pdf', signatur_position: null })).toBe('aktiv')
    expect(dokumentZustand({ dokument_typ: 'sv_berufshaftpflicht', status: 'geprueft', dokument_url: 'sv-pflicht/x.pdf', signatur_position: null })).toBe('aktiv')
  })
  it('abgelehnt bleibt abgelehnt', () => {
    expect(dokumentZustand({ dokument_typ: 'sv_sicherungsabtretung', status: 'abgelehnt', dokument_url: 'sv-pflicht/x.pdf', signatur_position: { page: 0 } })).toBe('abgelehnt')
  })
})
