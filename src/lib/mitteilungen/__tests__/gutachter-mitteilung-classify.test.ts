import { describe, expect, it } from 'vitest'
import { classifyGutachterMitteilung } from '../gutachter-mitteilung-classify'

// Phase 5: gutachter_mitteilungen retired -> SV-Notifs gehen in die kanonische
// `mitteilungen`. classify routet jeden typ: derived Action-Source deckt -> drop
// (nicht materialisieren, sonst Doppel-Eintrag); sonst Info + Prioritaet.
describe('classifyGutachterMitteilung — Phase-5-Retire-Routing', () => {
  it('derived-covered typ -> drop', () => {
    for (const t of ['kunde_chat_nachricht', 'gutachten_erinnerung', 'qc_nachbesserung', 're_termin_kundenwahl']) {
      expect(classifyGutachterMitteilung(t), t).toEqual({ action: 'drop' })
    }
  })

  it('hoch-prio Info-typ (Warnungen/Billing/Auftrag)', () => {
    for (const t of ['vorschaden_warnung', 'paket_fast_voll', 'guthaben_niedrig', 'nachbesichtigung_beauftragt', 'stellungnahme_beauftragt']) {
      expect(classifyGutachterMitteilung(t), t).toEqual({ action: 'info', prioritaet: 'hoch' })
    }
  })

  it('normale Info-typ', () => {
    for (const t of ['neuer_auftrag', 'termin_bestaetigt', 'termin_geaendert', 'kunde_dokument_hochgeladen', 'qc_bestanden', 'kanzlei_as_gesendet', 'kanzlei_regulierung', 'kanzlei_zahlung', 'auftrag_storniert']) {
      expect(classifyGutachterMitteilung(t), t).toEqual({ action: 'info', prioritaet: 'normal' })
    }
  })

  it('unbekannter typ -> info normal (defensiv)', () => {
    expect(classifyGutachterMitteilung('irgendwas')).toEqual({ action: 'info', prioritaet: 'normal' })
  })
})
