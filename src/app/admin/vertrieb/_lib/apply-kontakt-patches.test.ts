import { describe, it, expect } from 'vitest'
import {
  wendeKontaktPatchesAn,
  mergeKontaktPatch,
  kontaktPatchKey,
} from './apply-kontakt-patches'
import { deriveVertriebState } from '@/lib/vertrieb/derive-vertrieb-state'
import type { VertriebKontaktRow } from '@/lib/vertrieb/vertrieb-kontakt.types'

const row: VertriebKontaktRow = {
  id: 'lead-1', kind: 'partner-lead', name: 'Muster GmbH', email: null, telefon: null,
  plz: null, ort: null, lat: null, lng: null, owner_id: null, quelle: null, erstellt_am: null,
  roh_status: 'neu', roh_ist_aktiv: null, roh_gesperrt: null, roh_verifiziert: null,
  roh_portal_zugang: null, roh_onboarding_offen: null, roh_warteliste: null, notizen: null,
  rolle: 'werkstatt',
}
const lead = deriveVertriebState(row) // stufe 'neu'
const anderer = deriveVertriebState({ ...row, id: 'lead-2' })

describe('kontaktPatchKey', () => {
  it('kombiniert kind + id', () => {
    expect(kontaktPatchKey('partner-lead', 'lead-1')).toBe('partner-lead:lead-1')
  })
})

describe('wendeKontaktPatchesAn', () => {
  it('leere Patch-Map -> identisches Array (kein Re-Map)', () => {
    const liste = [lead, anderer]
    expect(wendeKontaktPatchesAn(liste, {})).toBe(liste)
  })

  it('optimistischer Status-Patch leitet die Stufe (Badge) neu ab', () => {
    // 'neu' -> 'qualifiziert' verschiebt die partner-lead-Stufe auf 'kontaktiert'
    const patches = { 'partner-lead:lead-1': { roh_status: 'qualifiziert' } }
    const [erste, zweite] = wendeKontaktPatchesAn([lead, anderer], patches)
    expect(lead.stufe).toBe('neu') // Original unveraendert (Immutabilitaet)
    expect(erste.stufe).toBe('kontaktiert') // Badge folgt dem Patch in Echtzeit
    expect(erste.roh_status).toBe('qualifiziert')
    expect(zweite).toBe(anderer) // nicht gepatchte Zeile bleibt identisch
  })

  it('abgelehnt -> Stufe verloren', () => {
    const patches = { 'partner-lead:lead-1': { roh_status: 'abgelehnt' } }
    expect(wendeKontaktPatchesAn([lead], patches)[0].stufe).toBe('verloren')
  })

  it('Patch fuer eine andere id laesst die Zeile unberuehrt', () => {
    const patches = { 'partner-lead:lead-999': { roh_status: 'abgelehnt' } }
    expect(wendeKontaktPatchesAn([lead], patches)[0]).toBe(lead)
  })
})

describe('mergeKontaktPatch', () => {
  it('legt einen neuen Eintrag an', () => {
    const m = mergeKontaktPatch({}, 'partner-lead', 'lead-1', { roh_status: 'kontaktiert' })
    expect(m['partner-lead:lead-1']).toEqual({ roh_status: 'kontaktiert' })
  })

  it('merged auf einen bestehenden Eintrag (behaelt frueheren Feld-Patch)', () => {
    const m1 = mergeKontaktPatch({}, 'partner-lead', 'lead-1', { roh_status: 'kontaktiert' })
    const m2 = mergeKontaktPatch(m1, 'partner-lead', 'lead-1', { notizen: 'Rueckruf Fr' })
    expect(m2['partner-lead:lead-1']).toEqual({ roh_status: 'kontaktiert', notizen: 'Rueckruf Fr' })
    // Immutabilitaet: die alte Map bleibt unangetastet
    expect(m1['partner-lead:lead-1']).toEqual({ roh_status: 'kontaktiert' })
  })
})
