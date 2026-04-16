import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getAlleSlots,
  getKatalogSlot,
  getSlotsFuerFall,
  getPflichtSlotsFuerFall,
  getPflichtSlotsFuerLeadFall,
  invalidateKatalogCache,
  type DokumentKatalogRow,
} from './katalog'

// Minimaler Mock — nur die Chain, die getAlleSlots anspricht:
// .from('dokument_katalog').select(...).eq('aktiv', true).order('sort_order', ...)
function buildMockSupabase(rows: DokumentKatalogRow[], err: unknown = null) {
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    order: vi.fn(() => Promise.resolve({ data: rows, error: err })),
  }
  return {
    from: vi.fn(() => chain),
  } as unknown as SupabaseClient
}

const SLOT_FAHRZEUGSCHEIN: DokumentKatalogRow = {
  slot_id: 'fahrzeugschein',
  label: 'Fahrzeugschein (ZB1)',
  beschreibung: null,
  kategorie: 'stammdaten',
  freigeschaltet_wenn: null,
  pflicht_wenn: { op: 'not_in', field: 'lead.zb1_status', value: ['bestaetigt', 'hochgeladen'] },
  sichtbar_fuer: ['admin'],
  anforderbar_von: ['admin'],
  uploadbar_von: ['kunde'],
  multi_file: false,
  akzeptierte_mime_types: ['application/pdf'],
  max_mb: 10,
  sort_order: 1,
  aktiv: true,
}

const SLOT_AERZTLICHES_ATTEST: DokumentKatalogRow = {
  slot_id: 'aerztliches_attest',
  label: 'Ärztliches Attest',
  beschreibung: null,
  kategorie: 'personenschaden',
  freigeschaltet_wenn: { op: 'eq', field: 'lead.personenschaden_flag', value: true },
  pflicht_wenn: { op: 'eq', field: 'lead.personenschaden_flag', value: true },
  sichtbar_fuer: ['admin'],
  anforderbar_von: ['admin'],
  uploadbar_von: ['kunde'],
  multi_file: true,
  akzeptierte_mime_types: ['application/pdf'],
  max_mb: 10,
  sort_order: 21,
  aktiv: true,
}

const SLOT_SCHADENSFOTOS: DokumentKatalogRow = {
  slot_id: 'schadensfotos',
  label: 'Schadensfotos',
  beschreibung: null,
  kategorie: 'unfall',
  freigeschaltet_wenn: null,
  pflicht_wenn: null,
  sichtbar_fuer: ['admin'],
  anforderbar_von: ['admin'],
  uploadbar_von: ['kunde'],
  multi_file: true,
  akzeptierte_mime_types: ['image/jpeg'],
  max_mb: 20,
  sort_order: 12,
  aktiv: true,
}

describe('katalog', () => {
  beforeEach(() => {
    invalidateKatalogCache()
  })

  describe('getAlleSlots', () => {
    it('lädt alle aktiven Slots', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN, SLOT_AERZTLICHES_ATTEST])
      const rows = await getAlleSlots(mock)
      expect(rows).toHaveLength(2)
      expect(rows[0].slot_id).toBe('fahrzeugschein')
    })

    it('cached result — zweiter Aufruf trifft die DB nicht', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN])
      await getAlleSlots(mock)
      await getAlleSlots(mock)
      expect(mock.from).toHaveBeenCalledTimes(1)
    })

    it('invalidateKatalogCache zwingt Neu-Fetch', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN])
      await getAlleSlots(mock)
      invalidateKatalogCache()
      await getAlleSlots(mock)
      expect(mock.from).toHaveBeenCalledTimes(2)
    })

    it('DB-Fehler → leeres Array, kein Cache', async () => {
      const mock = buildMockSupabase([], { message: 'boom' })
      const rows = await getAlleSlots(mock)
      expect(rows).toEqual([])
      // Zweiter Aufruf soll neu laden (kein Fehler-Cache)
      await getAlleSlots(mock)
      expect(mock.from).toHaveBeenCalledTimes(2)
    })
  })

  describe('getKatalogSlot', () => {
    it('findet Slot per slot_id', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN, SLOT_AERZTLICHES_ATTEST])
      const slot = await getKatalogSlot(mock, 'aerztliches_attest')
      expect(slot?.slot_id).toBe('aerztliches_attest')
    })

    it('unbekannte slot_id → null', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN])
      const slot = await getKatalogSlot(mock, 'nicht_existiert')
      expect(slot).toBeNull()
    })
  })

  describe('getSlotsFuerFall', () => {
    it('filtert auf freigeschaltete Slots', async () => {
      const mock = buildMockSupabase([
        SLOT_FAHRZEUGSCHEIN,
        SLOT_AERZTLICHES_ATTEST,
        SLOT_SCHADENSFOTOS,
      ])
      const ctx = { 'lead.personenschaden_flag': false, 'lead.zb1_status': 'offen' }
      const slots = await getSlotsFuerFall(mock, ctx)
      // aerztliches_attest NICHT dabei (personenschaden_flag=false)
      expect(slots.map((s) => s.slot_id).sort()).toEqual(['fahrzeugschein', 'schadensfotos'])
    })

    it('freigeschaltet_wenn=null → immer freigeschaltet', async () => {
      const mock = buildMockSupabase([SLOT_SCHADENSFOTOS])
      const slots = await getSlotsFuerFall(mock, {})
      expect(slots).toHaveLength(1)
    })
  })

  describe('getPflichtSlotsFuerFall', () => {
    it('filtert auf Pflicht-Slots (pflicht_wenn nicht null + true)', async () => {
      const mock = buildMockSupabase([
        SLOT_FAHRZEUGSCHEIN,
        SLOT_AERZTLICHES_ATTEST,
        SLOT_SCHADENSFOTOS,
      ])
      // personenschaden = true, zb1_status = 'offen' → beide Pflicht
      const ctx = { 'lead.personenschaden_flag': true, 'lead.zb1_status': 'offen' }
      const pflicht = await getPflichtSlotsFuerFall(mock, ctx)
      expect(pflicht.map((s) => s.slot_id).sort()).toEqual(['aerztliches_attest', 'fahrzeugschein'])
    })

    it('pflicht_wenn = null → NIE Pflicht (schadensfotos ist optional)', async () => {
      const mock = buildMockSupabase([SLOT_SCHADENSFOTOS])
      const pflicht = await getPflichtSlotsFuerFall(mock, {})
      expect(pflicht).toEqual([])
    })

    it('ZB1 bereits bestätigt → fahrzeugschein NICHT Pflicht', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN])
      const ctx = { 'lead.zb1_status': 'bestaetigt' }
      const pflicht = await getPflichtSlotsFuerFall(mock, ctx)
      expect(pflicht).toEqual([])
    })

    it('Slot nicht freigeschaltet → kann auch nicht Pflicht sein', async () => {
      // aerztliches_attest: freigeschaltet_wenn=personenschaden_flag=true
      // Wenn Flag false → weder freigeschaltet noch Pflicht.
      const mock = buildMockSupabase([SLOT_AERZTLICHES_ATTEST])
      const ctx = { 'lead.personenschaden_flag': false }
      const pflicht = await getPflichtSlotsFuerFall(mock, ctx)
      expect(pflicht).toEqual([])
    })
  })

  describe('getPflichtSlotsFuerLeadFall', () => {
    it('baut Kontext aus Lead + Fall und filtert', async () => {
      const mock = buildMockSupabase([SLOT_FAHRZEUGSCHEIN, SLOT_AERZTLICHES_ATTEST])
      const pflicht = await getPflichtSlotsFuerLeadFall(mock, {
        lead: { personenschaden_flag: true, zb1_status: 'offen' },
        fall: { status: 'sv-termin' },
      })
      expect(pflicht.map((s) => s.slot_id).sort()).toEqual(['aerztliches_attest', 'fahrzeugschein'])
    })

    it('null Lead + null Fall → keine Pflicht (wegen default-Regeln)', async () => {
      const mock = buildMockSupabase([SLOT_AERZTLICHES_ATTEST])
      const pflicht = await getPflichtSlotsFuerLeadFall(mock, { lead: null, fall: null })
      expect(pflicht).toEqual([])
    })
  })
})
