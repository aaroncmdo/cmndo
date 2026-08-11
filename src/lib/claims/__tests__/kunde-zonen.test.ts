import { describe, it, expect } from 'vitest'
import { deriveKundeZonen, deriveKundeAufgaben } from '../kunde-zonen'
import type { KundeClaimViewModel } from '../kunde-claim-view'

// Minimal-VM-Factory — nur die Felder, die die reinen Ableitungen lesen.
function vm(over: Record<string, unknown> = {}): KundeClaimViewModel {
  const base = {
    lifecycle: { mainPhase: 'begutachtung', subPhase: 'termin' },
    termine: [],
    team: { kb: null, sv: null },
    status: { svTermin: null },
    geld: { forderungNetto: null, auszahlungNetto: null, kvaNetto: null, kvaBrutto: null, kvaAbgelehntAm: null, kvaAbgelehntGrund: null, reparaturdauerTageKva: null, gutachtenWerte: null },
    pflichtdokumente: { offen: 0 },
    fall: {},
    flags: { abrechnungsweg: null, istReparaturRoute: false, bankdatenOffen: false, gutachtenVerfuegbar: false, reparaturFreigegeben: false, istNurGutachter: false, kanzleiSichtbar: false, istTerminal: false },
  }
  return { ...base, ...over, lifecycle: { ...base.lifecycle, ...(over.lifecycle as object ?? {}) }, status: { ...base.status, ...(over.status as object ?? {}) }, team: { ...base.team, ...(over.team as object ?? {}) }, geld: { ...base.geld, ...(over.geld as object ?? {}) }, flags: { ...base.flags, ...(over.flags as object ?? {}) } } as unknown as KundeClaimViewModel
}

describe('deriveKundeAufgaben', () => {
  it('nichts offen (SV zugewiesen, kein Termin-Wahl-Bedarf) -> []', () => {
    // Mit zugewiesenem SV greift die termin_waehlen-Aufgabe NICHT (der Kalender-Fallback ist
    // für den !svId-Fall) → ein sonst leerer Claim hat keine offenen Aufgaben.
    expect(deriveKundeAufgaben(vm({ team: { kb: null, sv: { name: 'SV' } } }))).toEqual([])
  })

  // T4: Gutachtertermin wählen
  it('kein SV + kein Termin + nicht terminal + Begutachtung -> termin_waehlen', () => {
    expect(deriveKundeAufgaben(vm()).map((a) => a.id)).toContain('termin_waehlen')
  })
  it('SV zugewiesen -> KEIN termin_waehlen', () => {
    const r = deriveKundeAufgaben(vm({ team: { kb: null, sv: { name: 'SV' } } }))
    expect(r.map((a) => a.id)).not.toContain('termin_waehlen')
  })
  it('bereits ein (Wunsch-)Termin gewählt (svTermin gesetzt) -> KEIN termin_waehlen', () => {
    const r = deriveKundeAufgaben(vm({ status: { svTermin: { id: 't1', status: 'sv_gesucht' } } }))
    expect(r.map((a) => a.id)).not.toContain('termin_waehlen')
  })
  it('Reparatur-Route (braucht keine SV-Begutachtung) -> KEIN termin_waehlen', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true } }))
    expect(r.map((a) => a.id)).not.toContain('termin_waehlen')
  })
  it('terminaler Claim -> KEIN termin_waehlen', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istTerminal: true } }))
    expect(r.map((a) => a.id)).not.toContain('termin_waehlen')
  })
  it('Reparatur-Route + KVA + nicht freigegeben -> kva_freigabe', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: false }, geld: { kvaBrutto: 2380 } }))
    expect(r.map((a) => a.id)).toContain('kva_freigabe')
  })
  it('KVA aber bereits freigegeben -> KEIN kva_freigabe', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: true }, geld: { kvaBrutto: 2380 } }))
    expect(r.map((a) => a.id)).not.toContain('kva_freigabe')
  })
  it('R2: netto-only-KVA (kein brutto) feuert kva_freigabe (jeder KVA-Consumer nutzt brutto ?? netto)', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: false }, geld: { kvaNetto: 2000, kvaBrutto: null } }))
    expect(r.map((a) => a.id)).toContain('kva_freigabe')
  })
  it('R1-Kohaerenz: KVA vom Kunden abgelehnt -> KEIN kva_freigabe (Werkstatt ueberarbeitet)', () => {
    const r = deriveKundeAufgaben(vm({ flags: { istReparaturRoute: true, reparaturFreigegeben: false }, geld: { kvaBrutto: 2380, kvaAbgelehntAm: '2026-07-24T10:00:00Z' } }))
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
    // svTermin gesetzt = Termin bereits gewählt → die T4-termin_waehlen-Aufgabe (und damit die
    // aufgaben-Zone) greift nicht; der Fall hat sonst nichts Offenes.
    expect(deriveKundeZonen(vm({ team: { kb: { name: 'KB' }, sv: null }, status: { svTermin: { id: 't', status: 'bestaetigt' } } }))).toEqual(['status', 'team', 'doksTermine'])
  })
  it('Regulierung -> geld erscheint (in Reihenfolge)', () => {
    expect(deriveKundeZonen(vm({ lifecycle: { mainPhase: 'regulierung' }, status: { svTermin: { id: 't', status: 'bestaetigt' } } }))).toEqual(['status', 'geld', 'doksTermine'])
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

// Audit-Funde b3/b4 (Kasko-Audit 15.07., gefixt 17.07.):
// b4: werkstatt_vorschlag fehlte in TERMIN_OFFEN — der handlungspflichtigste Status
//     (Werkstatt schlaegt Termin vor, Kunde muss Passt/Passt-nicht) erzeugte KEINE Aufgabe.
// b3: der CTA verlinkte pauschal nach doksTermine — der Reparaturtermin lebt aber in der
//     GeldZone (WerkstattCard) -> zone ist jetzt termin-art-abhaengig.
describe('deriveKundeAufgaben — Termin-Bestaetigung (Audit b3/b4)', () => {
  it('b4: werkstatt_vorschlag erzeugt die Termin-Aufgabe', () => {
    const r = deriveKundeAufgaben(
      vm({ termine: [{ id: 't1', art: 'reparatur', start: null, status: 'werkstatt_vorschlag', claim_id: null }] }),
    )
    expect(r.map((a) => a.id)).toContain('termin_bestaetigen')
  })

  it('b3: Reparaturtermin verlinkt in die GeldZone, SV-Termin nach DoksTermine', () => {
    const rep = deriveKundeAufgaben(
      vm({ termine: [{ id: 't1', art: 'reparatur', start: null, status: 'angefragt', claim_id: null }] }),
    )
    expect(rep.find((a) => a.id === 'termin_bestaetigen')?.zone).toBe('geld')

    const sv = deriveKundeAufgaben(
      vm({ termine: [{ id: 't2', art: 'sv', start: null, status: 'reserviert', claim_id: null }] }),
    )
    expect(sv.find((a) => a.id === 'termin_bestaetigen')?.zone).toBe('doksTermine')
  })

  it('bestaetigt/erledigt/storniert/abgelehnt erzeugen KEINE Termin-Aufgabe', () => {
    for (const status of ['bestaetigt', 'erledigt', 'storniert', 'abgelehnt']) {
      const r = deriveKundeAufgaben(
        vm({ termine: [{ id: 't1', art: 'reparatur', start: null, status, claim_id: null }] }),
      )
      expect(r.map((a) => a.id)).not.toContain('termin_bestaetigen')
    }
  })
})
