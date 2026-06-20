// CMM-49 Feststellung-doppelt (Increment 3): Unit-Tests fuer die reine Build-Logik
// des verursacher-party-onboarding-Writers (Allowlist + Coercion). Die IO-Seite
// (ownership-gate + claim_parties insert/update) lebt im 'use server'-saveStep.ts
// und wird via Build/tsc + DB-Constraint-Verifikation + Aaron-Browser-E2E abgedeckt.

import { describe, it, expect } from 'vitest'
import { buildVerursacherPartyUpdates, PARTY_ONBOARDING_WRITABLE } from '../verursacher-party-facts'
import type { OnboardingFeld } from '@/components/onboarding/types'

function feld(feld_key: string, tabelle: string, spalte: string): OnboardingFeld {
  return {
    id: feld_key,
    phase_id: 'p',
    reihenfolge: 0,
    feld_key,
    typ: 'text',
    label: feld_key,
    pflicht: false,
    db_target: { tabelle, spalte },
  }
}

describe('buildVerursacherPartyUpdates', () => {
  it('routet die kanonischen Gegner-Felder auf ihre verursacher-party-Spalten', () => {
    const felder = [
      feld('gegner_kennzeichen', 'claim_parties', 'kennzeichen'),
      feld('gegner_versicherung', 'claim_parties', 'versicherung_klartext'),
      feld('gegner_versicherungsnummer', 'claim_parties', 'versicherungsnummer'),
    ]
    const values = {
      gegner_kennzeichen: 'K-AB 1234',
      gegner_versicherung: 'HUK-Coburg',
      gegner_versicherungsnummer: 'VS-99',
    }
    expect(buildVerursacherPartyUpdates(felder, values)).toEqual({
      kennzeichen: 'K-AB 1234',
      versicherung_klartext: 'HUK-Coburg',
      versicherungsnummer: 'VS-99',
    })
  })

  it('ueberspringt party-Spalten ausserhalb der harten Allowlist (Defense-in-Depth)', () => {
    const felder = [
      feld('gegner_kennzeichen', 'claim_parties', 'kennzeichen'),
      feld('gegner_vers_id', 'claim_parties', 'versicherung_id'), // FK — NICHT erlaubt
      feld('boese', 'claim_parties', 'user_id'), // NICHT erlaubt
    ]
    const values = { gegner_kennzeichen: 'K-AB 1', gegner_vers_id: 'uuid-x', boese: 'uuid-y' }
    expect(buildVerursacherPartyUpdates(felder, values)).toEqual({ kennzeichen: 'K-AB 1' })
  })

  it('ignoriert Felder deren db_target nicht claim_parties ist', () => {
    const felder = [
      feld('hat_personenschaden', 'claims', 'hat_personenschaden'),
      feld('schadensfotos', 'leads', 'schadensfoto_urls'),
      feld('gegner_kennzeichen', 'claim_parties', 'kennzeichen'),
    ]
    const values = { hat_personenschaden: true, schadensfotos: ['x'], gegner_kennzeichen: 'K-AB 1' }
    expect(buildVerursacherPartyUpdates(felder, values)).toEqual({ kennzeichen: 'K-AB 1' })
  })

  it('coerced leere / nur-Whitespace-Strings zu null (bewusstes Leeren)', () => {
    const felder = [
      feld('gegner_kennzeichen', 'claim_parties', 'kennzeichen'),
      feld('gegner_versicherung', 'claim_parties', 'versicherung_klartext'),
    ]
    const values = { gegner_kennzeichen: '', gegner_versicherung: '   ' }
    expect(buildVerursacherPartyUpdates(felder, values)).toEqual({
      kennzeichen: null,
      versicherung_klartext: null,
    })
  })

  it('ueberspringt Felder die in values fehlen (kein Overwrite mit undefined)', () => {
    const felder = [
      feld('gegner_kennzeichen', 'claim_parties', 'kennzeichen'),
      feld('gegner_versicherung', 'claim_parties', 'versicherung_klartext'),
    ]
    const values = { gegner_kennzeichen: 'K-AB 1' } // versicherung fehlt
    expect(buildVerursacherPartyUpdates(felder, values)).toEqual({ kennzeichen: 'K-AB 1' })
  })

  it('exponiert die Allowlist als die drei kanonischen party-Spalten', () => {
    expect([...PARTY_ONBOARDING_WRITABLE].sort()).toEqual([
      'kennzeichen',
      'versicherung_klartext',
      'versicherungsnummer',
    ])
  })
})
