import { describe, it, expect } from 'vitest'
import { baueSvDokumentePhase, SV_DOKUMENTE_SLOTS } from './sv-dokumente-phase'

// Aaron 19.09.2026: „er muss die Dokumente hochladen können im Onboarding, weil das ist ja
// wichtig für die Sicherungsabtretungsunterzeichnung, Datenschutzerklärung etc." — der Basic-
// Wizard hatte bis dahin KEINEN Dokumentenschritt (5 DB-Phasen: Telefon · Standort · Profil ·
// Kalender · Vertrag). Die Phase wird wie die Widget-Phase CODE-injiziert (Renderer + Phase
// deployen atomar), damit eine DB-Phase ohne Renderer nie einen laufenden Wizard blockiert.

describe('baueSvDokumentePhase', () => {
  it('liegt zwischen Kalender (40) und Vertrag (50) und ist NIE Pflicht', () => {
    const phase = baueSvDokumentePhase({})
    expect(phase.reihenfolge).toBeGreaterThan(40)
    expect(phase.reihenfolge).toBeLessThan(50)
    expect(phase.felder).toHaveLength(1)
    expect(phase.felder[0].pflicht).toBe(false)
    expect(phase.felder[0].typ).toBe('sv-dokumente')
    // _self: der generische Writer überspringt den Wert — der Upload läuft über
    // uploadSvPflichtdokument, nicht über saveOnboardingFields.
    expect(phase.felder[0].db_target).toEqual({ tabelle: '_self', spalte: 'sv_dokumente' })
  })

  it('kennt genau die fünf Slots, die der Kundenflow und die Haftung brauchen', () => {
    expect(SV_DOKUMENTE_SLOTS.map((s) => s.slotId)).toEqual([
      'sv_berufshaftpflicht',
      'sv_gewerbeanmeldung',
      'sv_sicherungsabtretung',
      'sv_honorarvereinbarung',
      'sv_datenschutzerklaerung',
      'sv_widerrufsbelehrung',
    ])
  })

  it('reicht den aktuellen Dokumentenstand als optionen an den Renderer durch', () => {
    const phase = baueSvDokumentePhase({ sv_berufshaftpflicht: 'hochgeladen', sv_datenschutzerklaerung: 'geprueft' })
    const opt = phase.felder[0].optionen ?? []
    expect(opt.find((o) => o.value === 'sv_berufshaftpflicht')?.label).toBe('hochgeladen')
    expect(opt.find((o) => o.value === 'sv_datenschutzerklaerung')?.label).toBe('geprueft')
    expect(opt.find((o) => o.value === 'sv_gewerbeanmeldung')?.label).toBe('leer')
  })
})
