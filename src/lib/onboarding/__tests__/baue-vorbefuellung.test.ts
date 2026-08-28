import { describe, it, expect } from 'vitest'
import { baueVorbefuellung, flachKopie, type VorbefuellungsQuellen } from '../baue-vorbefuellung'

const leer: VorbefuellungsQuellen = { fall: null, claim: null, lead: null, vehicle: null, dokumente: [] }
const mit = (p: Partial<VorbefuellungsQuellen>): VorbefuellungsQuellen => ({ ...leer, ...p })

describe('Praezedenz — der Claim schlaegt den Lead', () => {
  // Die beiden real auf prod gemessenen Divergenzen (28.08.2026, 8 Zeilen gesamt).
  // Vor der Umkehr gewann hier jeweils der Lead.

  it('service_typ: der im Onboarding aufgestockte Wert bleibt stehen', () => {
    // Der Kunde waehlt „komplett", es landet in claims — beim naechsten Laden
    // stand vorher wieder „nur_gutachter" da (2 Claims auf prod).
    const p = baueVorbefuellung(mit({
      claim: { service_typ: 'komplett' },
      lead: { service_typ: 'nur_gutachter' },
    }))
    expect(p.service_typ).toBe('komplett')
  })

  it('reparatur_vermittlung_status: der fortgeschrittene Stand gewinnt', () => {
    // 6 Claims auf prod: claim 'vermittelt' vs. lead 'offen' (Anfangswert).
    const p = baueVorbefuellung(mit({
      claim: { reparatur_vermittlung_status: 'vermittelt' },
      lead: { reparatur_vermittlung_status: 'offen' },
    }))
    expect(p.reparatur_vermittlung_status).toBe('vermittelt')
  })

  it('gilt auch fuer `false` — ein Boolean ist ein Wert, keine Leere', () => {
    // polizei_vor_ort: der Kunde korrigiert im Onboarding auf „nein".
    const p = baueVorbefuellung(mit({
      claim: { polizei_vor_ort: false },
      lead: { polizei_vor_ort: true },
    }))
    expect(p.polizei_vor_ort).toBe(false)
  })
})

describe('… ohne dass ein leerer Claim etwas loescht', () => {
  // Das ist der Grund, warum die Umkehr nur 8 Zeilen beruehrt und nicht 47:
  // flachKopie nimmt Leeres gar nicht erst auf.

  it('null im Claim laesst den Lead-Wert stehen', () => {
    // Real: hat_vorschaeden ist in 47 von 47 Faellen NUR im Lead gefuellt.
    const p = baueVorbefuellung(mit({ claim: { hat_vorschaeden: null }, lead: { hat_vorschaeden: true } }))
    expect(p.hat_vorschaeden).toBe(true)
  })

  it('leerer String im Claim ebenso', () => {
    const p = baueVorbefuellung(mit({ claim: { schuldfrage: '' }, lead: { schuldfrage: 'gegner' } }))
    expect(p.schuldfrage).toBe('gegner')
  })

  it('eine Spalte, die es nur im Claim gibt, bleibt unberuehrt', () => {
    // kanzlei_wunsch: 47x nur im Claim gefuellt.
    const p = baueVorbefuellung(mit({ claim: { kanzlei_wunsch: 'ja' }, lead: {} }))
    expect(p.kanzlei_wunsch).toBe('ja')
  })
})

describe('die uebrige Reihenfolge bleibt, wie sie war', () => {
  it('Vehicle schlaegt den Claim — Fahrzeugdaten sind dort spezifischer', () => {
    const p = baueVorbefuellung(mit({ claim: { fin: 'AUS-CLAIM' }, vehicle: { fin: 'AUS-VEHICLE' } }))
    expect(p.fin).toBe('AUS-VEHICLE')
  })

  it('der Fall-Anker liegt zuunterst', () => {
    const p = baueVorbefuellung(mit({ fall: { id: 'fall' }, lead: { id: 'lead' }, claim: { id: 'claim' } }))
    expect(p.id).toBe('claim')
  })
})

describe('Dokument-Flags', () => {
  it('setzt Slot- und Typ-Flag', () => {
    const p = baueVorbefuellung(mit({ dokumente: [{ dokument_typ: 'polizeibericht', pflichtdokument_id: 'pd-1' }] }))
    expect(p['doc_pd-1']).toBe(true)
    expect(p.doc_typ_polizeibericht).toBe(true)
  })

  it('ein Dokument ohne Typ setzt nur das Slot-Flag', () => {
    const p = baueVorbefuellung(mit({ dokumente: [{ dokument_typ: null, pflichtdokument_id: 'pd-2' }] }))
    expect(p['doc_pd-2']).toBe(true)
    expect(Object.keys(p).filter((k) => k.startsWith('doc_typ_'))).toHaveLength(0)
  })
})

describe('Upload-Felder aus vorhandenen Dokumenten', () => {
  it('der hochgeladene Fahrzeugschein befuellt sein Feld', () => {
    const p = baueVorbefuellung(mit({ dokumente: [{ dokument_typ: 'fahrzeugschein', pflichtdokument_id: null }] }))
    expect(p.fahrzeugschein_foto).toBe(true)
  })

  it('beide Schreibweisen der Schadensfotos zaehlen', () => {
    for (const typ of ['schadensfoto', 'schadensfotos']) {
      const p = baueVorbefuellung(mit({ dokumente: [{ dokument_typ: typ, pflichtdokument_id: null }] }))
      expect(p.schadensfotos, typ).toBe(true)
    }
  })

  it('ohne Dokument bleibt das Feld leer', () => {
    expect(baueVorbefuellung(leer).fahrzeugschein_foto).toBeUndefined()
  })

  it('ein bereits gesetzter Feldwert wird nicht ueberschrieben', () => {
    const p = baueVorbefuellung(mit({
      claim: { fahrzeugschein_foto: 'https://…/schein.jpg' },
      dokumente: [{ dokument_typ: 'fahrzeugschein', pflichtdokument_id: null }],
    }))
    expect(p.fahrzeugschein_foto).toBe('https://…/schein.jpg')
  })
})

describe('Pflicht-Slots als zweite Nachweis-Quelle', () => {
  // Prod 28.08.: CLM-2026-03507 + CLM-2026-05265 tragen fahrzeugschein/polizeibericht
  // als Slot 'hochgeladen' MIT URL — und 0 Zeilen in fall_dokumente. Wer nur
  // fall_dokumente liest, fragt diese Kunden erneut.

  it('ein hochgeladener Slot befuellt sein Upload-Feld', () => {
    const p = baueVorbefuellung(mit({ pflichtSlots: [{ dokument_typ: 'fahrzeugschein', status: 'hochgeladen' }] }))
    expect(p.doc_typ_fahrzeugschein).toBe(true)
    expect(p.fahrzeugschein_foto).toBe(true)
  })

  it('„geprueft" zaehlt ebenso', () => {
    const p = baueVorbefuellung(mit({ pflichtSlots: [{ dokument_typ: 'fahrzeugschein', status: 'geprueft' }] }))
    expect(p.fahrzeugschein_foto).toBe(true)
  })

  it('„ausstehend" zaehlt NICHT — sonst gilt jede Anforderung als erfuellt', () => {
    const p = baueVorbefuellung(mit({ pflichtSlots: [{ dokument_typ: 'fahrzeugschein', status: 'ausstehend' }] }))
    expect(p.fahrzeugschein_foto).toBeUndefined()
    expect(p.doc_typ_fahrzeugschein).toBeUndefined()
  })

  it('„abgelehnt" und „nachgereicht_angefordert" ebenso wenig', () => {
    for (const status of ['abgelehnt', 'nachgereicht_angefordert']) {
      const p = baueVorbefuellung(mit({ pflichtSlots: [{ dokument_typ: 'fahrzeugschein', status }] }))
      expect(p.fahrzeugschein_foto, status).toBeUndefined()
    }
  })

  it('ohne pflichtSlots verhaelt sich alles wie zuvor', () => {
    expect(baueVorbefuellung(mit({})).doc_typ_fahrzeugschein).toBeUndefined()
  })

  it('beide Quellen zusammen sind kein Widerspruch', () => {
    const p = baueVorbefuellung(mit({
      dokumente: [{ dokument_typ: 'fahrzeugschein', pflichtdokument_id: 'pd-9' }],
      pflichtSlots: [{ dokument_typ: 'fahrzeugschein', status: 'hochgeladen' }],
    }))
    expect(p['doc_pd-9']).toBe(true)
    expect(p.fahrzeugschein_foto).toBe(true)
  })
})

describe('flachKopie', () => {
  it('filtert null, undefined und leeren String', () => {
    expect(flachKopie({ a: null, b: undefined, c: '', d: 0, e: false, f: 'x' }))
      .toEqual({ d: 0, e: false, f: 'x' })
  })

  it('`0` und `false` sind Werte, keine Leere', () => {
    expect(flachKopie({ n: 0, b: false })).toEqual({ n: 0, b: false })
  })

  it('null als Quelle ergibt ein leeres Objekt', () => {
    expect(flachKopie(null)).toEqual({})
  })
})
