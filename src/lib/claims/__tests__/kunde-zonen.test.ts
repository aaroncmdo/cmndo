import { describe, it, expect } from 'vitest'
import { deriveKundeZonen, deriveKundeAufgaben } from '../kunde-zonen'
import type { KundeClaimViewModel } from '../kunde-claim-view'

// Minimal-VM-Factory — nur die Felder, die die reinen Ableitungen lesen.
function vm(over: Record<string, unknown> = {}): KundeClaimViewModel {
  const base = {
    lifecycle: { mainPhase: 'begutachtung', subPhase: 'termin' },
    termine: [],
    team: { kb: null, sv: null },
    geld: { forderungNetto: null, auszahlungNetto: null, kvaNetto: null, kvaBrutto: null, reparaturdauerTageKva: null, gutachtenWerte: null },
    pflichtdokumente: { offen: 0 },
    fall: {},
    flags: { abrechnungsweg: null, istReparaturRoute: false, bankdatenOffen: false, gutachtenVerfuegbar: false, reparaturFreigegeben: false, istNurGutachter: false, kanzleiSichtbar: false },
  }
  return { ...base, ...over, lifecycle: { ...base.lifecycle, ...(over.lifecycle as object ?? {}) }, geld: { ...base.geld, ...(over.geld as object ?? {}) }, flags: { ...base.flags, ...(over.flags as object ?? {}) } } as unknown as KundeClaimViewModel
}

describe('deriveKundeAufgaben', () => {
  it('nichts offen -> []', () => {
    expect(deriveKundeAufgaben(vm())).toEqual([])
  })
  it('Reparatur-Route + KVA + nicht freigegeben -> kva_freigabe', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: false }, geld: { kvaBrutto: 2380 } }))
    expect(r.map((a) => a.id)).toContain('kva_freigabe')
  })
  it('KVA aber bereits freigegeben -> KEIN kva_freigabe', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: true }, geld: { kvaBrutto: 2380 } }))
    expect(r.map((a) => a.id)).not.toContain('kva_freigabe')
  })
  it('bankdatenOffen -> bankdaten; offene Pflichtdoks -> pflichtdok', () => {
    const r = deriveKundeAufgaben(vm({ flags: { bankdatenOffen: true }, pflichtdokumente: { offen: 2 } }))
    expect(r.map((a) => a.id)).toEqual(expect.arrayContaining(['bankdaten', 'pflichtdok']))
  })
  it('offener Terminwunsch -> termin_bestaetigen', () => {
    const r = deriveKundeAufgaben(vm({ termine: [{ id: 't1', art: 'sv', start: null, status: 'reserviert', claim_id: null }] }))
    expect(r.map((a) => a.id)).toContain('termin_bestaetigen')
  })
})

describe('deriveKundeZonen', () => {
  it('Begutachtung ohne Aufgaben/Geld, KB da -> status, team, doksTermine', () => {
    expect(deriveKundeZonen(vm({ team: { kb: { name: 'KB' }, sv: null } }))).toEqual(['status', 'team', 'doksTermine'])
  })
  it('Regulierung -> geld erscheint (in Reihenfolge)', () => {
    expect(deriveKundeZonen(vm({ lifecycle: { mainPhase: 'regulierung' } }))).toEqual(['status', 'geld', 'doksTermine'])
  })
  // Preserve-all: die GeldZone beherbergt jetzt auch Kanzlei/Werkstatt/Bankdaten-Cards,
  // die in der Live-page.tsx phasen-unabhaengig (in der immer-sichtbaren Sidebar) standen.
  // Darum erscheint die Zone auch ausserhalb der Regulierungs-Phase, wenn eine dieser
  // Karten Inhalt haette — sonst faellt sie in fruehen Phasen faelschlich weg.
  it('Reparatur-Route (Begutachtung) -> geld erscheint (Werkstatt/Schadenfoto-Cards)', () => {
    expect(deriveKundeZonen(vm({ flags: { istReparaturRoute: true } }))).toContain('geld')
  })
  it('Kanzlei sichtbar (Begutachtung) -> geld erscheint (MeineKanzlei/KanzleiPfad)', () => {
    expect(deriveKundeZonen(vm({ flags: { kanzleiSichtbar: true } }))).toContain('geld')
  })
  it('Bankdaten offen -> geld erscheint (BankdatenBanner)', () => {
    expect(deriveKundeZonen(vm({ flags: { bankdatenOffen: true } }))).toContain('geld')
  })
  it('nur_gutachter, fruehe Phase, keine Karten -> KEIN geld (phasen-adaptiv bleibt)', () => {
    expect(deriveKundeZonen(vm({ flags: { istNurGutachter: true } }))).not.toContain('geld')
  })
  it('offene Aufgabe -> aufgaben nach status', () => {
    const z = deriveKundeZonen(vm({ flags: { bankdatenOffen: true } }))
    expect(z[0]).toBe('status')
    expect(z[1]).toBe('aufgaben')
  })
  it('status + doksTermine immer, auch im Minimal-VM', () => {
    const z = deriveKundeZonen(vm())
    expect(z).toContain('status')
    expect(z).toContain('doksTermine')
  })
})
