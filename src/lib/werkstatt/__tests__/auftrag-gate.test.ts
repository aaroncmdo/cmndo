import { describe, it, expect } from 'vitest'
import {
  reparaturGate,
  istReparaturGateOffen,
  gateGrundLabel,
  type AuftragGateInput,
} from '../auftrag-gate'

const base: AuftragGateInput = {
  reparatur_auftrag_modus: 'kva_erst',
  kva_quelle: null,
  reparatur_freigegeben_am: null,
  kva_abgelehnt_am: null,
}

// Ops-Test 11.08. (RC-9): Im Haftpflichtfall ist der KVA nicht die Kostengrundlage —
// das GUTACHTEN ist es, und die gegnerische Haftpflicht reguliert danach. Das Gate
// blockierte trotzdem den Terminvorschlag der Werkstatt ("Kostenvoranschlag
// ausstehend"), obwohl sie dort gar keinen KVA liefern muss. Aaron: "das ist ein
// hard blocker". Das Kostenrisiko, gegen das das Gate schuetzt, existiert nur, wenn
// der KUNDE zahlt (kasko/selbstzahler).
describe('reparaturGate — Haftpflicht (Ops-Test RC-9)', () => {
  it('haftpflicht → offen, auch ohne KVA und ohne Freigabe', () => {
    expect(reparaturGate({ ...base, abrechnungsweg: 'haftpflicht' })).toEqual({ offen: true, grund: null })
  })

  it('haftpflicht → offen, auch wenn der Kunde einen Werkstatt-KVA abgelehnt hat', () => {
    expect(
      reparaturGate({
        ...base,
        abrechnungsweg: 'haftpflicht',
        kva_quelle: 'werkstatt',
        kva_abgelehnt_am: '2026-08-01T10:00:00Z',
      }).offen,
    ).toBe(true)
  })

  it('kasko/selbstzahler bleiben gegatet — dort traegt der Kunde das Kostenrisiko', () => {
    for (const weg of ['kasko', 'selbstzahler']) {
      expect(reparaturGate({ ...base, abrechnungsweg: weg })).toEqual({
        offen: false,
        grund: 'kva_ausstehend',
      })
    }
  })

  it('abrechnungsweg unbekannt/null → Verhalten unveraendert (defensiv gegatet)', () => {
    expect(reparaturGate({ ...base, abrechnungsweg: null }).offen).toBe(false)
    expect(reparaturGate({ ...base }).offen).toBe(false)
  })
})

describe('reparaturGate — Spec-E-Termin-Gate', () => {
  it("direkt → offen, egal welche Quelle/Freigabe", () => {
    expect(reparaturGate({ ...base, reparatur_auftrag_modus: 'direkt' })).toEqual({ offen: true, grund: null })
    expect(reparaturGate({ ...base, reparatur_auftrag_modus: 'direkt', kva_quelle: 'werkstatt' }).offen).toBe(true)
  })

  it("kva_quelle=kunde → offen (Preis kunde-seitig eingebracht)", () => {
    expect(reparaturGate({ ...base, kva_quelle: 'kunde' })).toEqual({ offen: true, grund: null })
  })

  it("kva_quelle=zubringer → offen", () => {
    expect(reparaturGate({ ...base, kva_quelle: 'zubringer' })).toEqual({ offen: true, grund: null })
  })

  it("Werkstatt-KVA + freigegeben → offen", () => {
    expect(reparaturGate({ ...base, kva_quelle: 'werkstatt', reparatur_freigegeben_am: '2026-07-17T10:00:00Z' }))
      .toEqual({ offen: true, grund: null })
  })

  it("Werkstatt-KVA ohne Freigabe → ZU (wartet_freigabe)", () => {
    expect(reparaturGate({ ...base, kva_quelle: 'werkstatt' })).toEqual({ offen: false, grund: 'wartet_freigabe' })
  })

  it("Werkstatt-KVA abgelehnt (ohne Freigabe) → ZU (abgelehnt)", () => {
    expect(reparaturGate({ ...base, kva_quelle: 'werkstatt', kva_abgelehnt_am: '2026-07-17T11:00:00Z' }))
      .toEqual({ offen: false, grund: 'abgelehnt' })
  })

  it("Freigabe schlägt Ablehnung (Re-Freigabe nach neuem KVA) → offen", () => {
    expect(reparaturGate({
      ...base, kva_quelle: 'werkstatt',
      reparatur_freigegeben_am: '2026-07-17T12:00:00Z', kva_abgelehnt_am: '2026-07-17T11:00:00Z',
    }).offen).toBe(true)
  })

  it("kva_erst ohne Quelle → ZU (kva_ausstehend)", () => {
    expect(reparaturGate(base)).toEqual({ offen: false, grund: 'kva_ausstehend' })
  })

  it("NULL modus verhält sich fail-closed wie kva_erst", () => {
    expect(reparaturGate({ ...base, reparatur_auftrag_modus: null })).toEqual({ offen: false, grund: 'kva_ausstehend' })
    expect(reparaturGate({ ...base, reparatur_auftrag_modus: null, kva_quelle: 'kunde' }).offen).toBe(true)
  })

  it("istReparaturGateOffen spiegelt reparaturGate.offen", () => {
    const faelle: AuftragGateInput[] = [
      base,
      { ...base, reparatur_auftrag_modus: 'direkt' },
      { ...base, kva_quelle: 'werkstatt' },
      { ...base, kva_quelle: 'kunde' },
    ]
    for (const f of faelle) expect(istReparaturGateOffen(f)).toBe(reparaturGate(f).offen)
  })
})

describe('gateGrundLabel', () => {
  it('liefert Umlaut-Texte je Grund; null bei offen', () => {
    expect(gateGrundLabel('kva_ausstehend')).toBe('Kostenvoranschlag ausstehend')
    expect(gateGrundLabel('wartet_freigabe')).toContain('Freigabe')
    expect(gateGrundLabel('abgelehnt')).toContain('abgelehnt')
    expect(gateGrundLabel(null)).toBeNull()
  })
})
