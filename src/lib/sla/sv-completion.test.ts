import { describe, it, expect } from 'vitest'
import { deriveSvSlaCompletion } from './sv-completion'

describe('deriveSvSlaCompletion', () => {
  // --- gutachter_zuweisung ---
  describe('gutachter_zuweisung', () => {
    it('false at sv-gesucht (not yet assigned)', () => {
      expect(
        deriveSvSlaCompletion('gutachter_zuweisung', {
          operativeStatus: 'sv-gesucht',
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })

    it('true at sv-zugewiesen (exact threshold)', () => {
      expect(
        deriveSvSlaCompletion('gutachter_zuweisung', {
          operativeStatus: 'sv-zugewiesen',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })

    it('true at kanzlei-uebergeben (well past threshold)', () => {
      expect(
        deriveSvSlaCompletion('gutachter_zuweisung', {
          operativeStatus: 'kanzlei-uebergeben',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })
  })

  // --- besichtigung ---
  describe('besichtigung', () => {
    it('false at sv-termin (before threshold)', () => {
      expect(
        deriveSvSlaCompletion('besichtigung', {
          operativeStatus: 'sv-termin',
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })

    it('true at begutachtung-laeuft (past threshold)', () => {
      expect(
        deriveSvSlaCompletion('besichtigung', {
          operativeStatus: 'begutachtung-laeuft',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })
  })

  // --- gutachten_upload ---
  describe('gutachten_upload', () => {
    it('false at besichtigung (before threshold)', () => {
      expect(
        deriveSvSlaCompletion('gutachten_upload', {
          operativeStatus: 'besichtigung',
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })

    it('true at gutachten-eingegangen (exact threshold)', () => {
      expect(
        deriveSvSlaCompletion('gutachten_upload', {
          operativeStatus: 'gutachten-eingegangen',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })
  })

  // --- termin_bestaetigung ---
  describe('termin_bestaetigung', () => {
    it('true when hasConfirmedTermin=true even at sv-termin (before status proxy)', () => {
      expect(
        deriveSvSlaCompletion('termin_bestaetigung', {
          operativeStatus: 'sv-termin',
          hasConfirmedTermin: true,
        }),
      ).toBe(true)
    })

    it('true at besichtigung with hasConfirmedTermin=false (status proxy)', () => {
      expect(
        deriveSvSlaCompletion('termin_bestaetigung', {
          operativeStatus: 'besichtigung',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })

    it('false at sv-termin with hasConfirmedTermin=false', () => {
      expect(
        deriveSvSlaCompletion('termin_bestaetigung', {
          operativeStatus: 'sv-termin',
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })
  })

  // --- terminal statuses ---
  describe('terminal operativeStatus', () => {
    it('true for abgeschlossen + gutachter_zuweisung', () => {
      expect(
        deriveSvSlaCompletion('gutachter_zuweisung', {
          operativeStatus: 'abgeschlossen',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })

    it('true for abgeschlossen + gutachten_upload', () => {
      expect(
        deriveSvSlaCompletion('gutachten_upload', {
          operativeStatus: 'abgeschlossen',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })

    it('true for storniert + gutachter_zuweisung (storniert is NOT in order array)', () => {
      expect(
        deriveSvSlaCompletion('gutachter_zuweisung', {
          operativeStatus: 'storniert',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })

    it('true for storniert + gutachten_upload', () => {
      expect(
        deriveSvSlaCompletion('gutachten_upload', {
          operativeStatus: 'storniert',
          hasConfirmedTermin: false,
        }),
      ).toBe(true)
    })
  })

  // --- null / unknown ---
  describe('null or unknown operativeStatus', () => {
    it('false for null operativeStatus + gutachten_upload (conservative)', () => {
      expect(
        deriveSvSlaCompletion('gutachten_upload', {
          operativeStatus: null,
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })

    it('true for null operativeStatus + termin_bestaetigung when hasConfirmedTermin=true', () => {
      expect(
        deriveSvSlaCompletion('termin_bestaetigung', {
          operativeStatus: null,
          hasConfirmedTermin: true,
        }),
      ).toBe(true)
    })

    it('false for unknown reparatur-laeuft status + besichtigung (conservative)', () => {
      expect(
        deriveSvSlaCompletion('besichtigung', {
          operativeStatus: 'reparatur-laeuft',
          hasConfirmedTermin: false,
        }),
      ).toBe(false)
    })
  })
})
