// AAR-432: Unit-Tests für getKundenJetztZuTun. Ein Test pro State +
// Priority-Logik + SLA-Boost.
import { describe, expect, it } from 'vitest'
import {
  getKundenJetztZuTun,
  type KundeFallContext,
  type KundeSlaRecord,
} from './jetzt-zu-tun'

function makeFall(overrides: Partial<KundeFallContext> = {}): KundeFallContext {
  return {
    id: 'fall-test-1',
    onboarding_complete: true,
    sa_unterschrieben: true,
    vollmacht_signiert_am: new Date('2026-04-01').toISOString(),
    gutachter_termin_status: null,
    sv_termin: null,
    gutachter_termin_bestaetigt_am: null,
    anschlussschreiben_am: null,
    regulierung_am: null,
    polizei_vor_ort: false,
    polizeibericht_uploaded: false,
    hat_offene_nachreichung: false,
    sv_unterwegs_seit: null,
    sv_angekommen_am: null,
    status: 'sv-zugewiesen',
    ...overrides,
  }
}

describe('getKundenJetztZuTun — 11 States', () => {
  it('1. onboarding-offen: wenn onboarding_complete=false', () => {
    const a = getKundenJetztZuTun(makeFall({ onboarding_complete: false }))
    expect(a?.state).toBe('onboarding-offen')
    expect(a?.prioritaet).toBe('hoch')
    expect(a?.cta?.href).toBe('/kunde/onboarding')
  })

  it('2. pflichtdokumente-offen: wenn hat_offene_nachreichung=true', () => {
    const a = getKundenJetztZuTun(makeFall({ hat_offene_nachreichung: true }))
    expect(a?.state).toBe('pflichtdokumente-offen')
    expect(a?.prioritaet).toBe('hoch')
  })

  it('3. polizeibericht-fehlt: polizei_vor_ort=true und kein Upload', () => {
    const a = getKundenJetztZuTun(
      makeFall({ polizei_vor_ort: true, polizeibericht_uploaded: false }),
    )
    expect(a?.state).toBe('polizeibericht-fehlt')
  })

  it('3b. polizeibericht-fehlt NICHT wenn Upload vorhanden', () => {
    const a = getKundenJetztZuTun(
      makeFall({ polizei_vor_ort: true, polizeibericht_uploaded: true }),
    )
    expect(a?.state).not.toBe('polizeibericht-fehlt')
  })

  it('4. daten-an-kanzlei: SLA-Breach mit blocker_rolle=kunde', () => {
    const sla: KundeSlaRecord[] = [
      {
        fall_id: 'fall-test-1',
        blocker_rolle: 'kunde',
        status: 'breached',
        blocker_grund: 'Kontoauszug fehlt',
        breach_at: '2026-04-18T10:00:00Z',
      },
    ]
    const a = getKundenJetztZuTun(makeFall(), sla)
    expect(a?.state).toBe('daten-an-kanzlei')
    expect(a?.prioritaet).toBe('hoch')
    expect(a?.deadline_am).toBe('2026-04-18T10:00:00Z')
    expect(a?.beschreibung).toContain('Kontoauszug')
  })

  it('5. termin-vor-ort: sv_angekommen_am gesetzt', () => {
    const a = getKundenJetztZuTun(
      makeFall({ sv_angekommen_am: new Date().toISOString(), sv_name: 'Markus' }),
    )
    expect(a?.state).toBe('termin-vor-ort')
    expect(a?.variant).toBe('live')
    expect(a?.beschreibung).toContain('Markus')
  })

  it('6. termin-unterwegs: sv_unterwegs_seit gesetzt, nicht angekommen', () => {
    const a = getKundenJetztZuTun(
      makeFall({
        sv_unterwegs_seit: new Date().toISOString(),
        sv_eta_minuten: 25,
        sv_name: 'Markus',
      }),
    )
    expect(a?.state).toBe('termin-unterwegs')
    expect(a?.variant).toBe('live')
    expect(a?.beschreibung).toContain('25')
  })

  it('6b. nachbesichtigung-waehlen: nachbesichtigung_status=angefordert (AAR-558 C11)', () => {
    const a = getKundenJetztZuTun(
      makeFall({ nachbesichtigung_status: 'angefordert' }),
    )
    expect(a?.state).toBe('nachbesichtigung-waehlen')
    expect(a?.prioritaet).toBe('hoch')
    expect(a?.cta?.href).toBe('/kunde/nachbesichtigung/fall-test-1')
  })

  it('6b. nachbesichtigung-waehlen greift unabhängig vom Fall-Status', () => {
    const a = getKundenJetztZuTun(
      makeFall({
        nachbesichtigung_status: 'angefordert',
        status: 'regulierung-laeuft',
      }),
    )
    expect(a?.state).toBe('nachbesichtigung-waehlen')
  })

  it('6b. nachbesichtigung-waehlen NICHT wenn status != angefordert', () => {
    const a = getKundenJetztZuTun(
      makeFall({ nachbesichtigung_status: 'termin-eingereicht' }),
    )
    expect(a?.state).not.toBe('nachbesichtigung-waehlen')
  })

  it('7. termin-bestaetigen: sv_termin + status=reserviert, nicht bestätigt', () => {
    const inZukunft = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString()
    const a = getKundenJetztZuTun(
      makeFall({
        sv_termin: inZukunft,
        gutachter_termin_status: 'reserviert',
        gutachter_termin_bestaetigt_am: null,
      }),
    )
    expect(a?.state).toBe('termin-bestaetigen')
    expect(a?.prioritaet).toBe('hoch')
  })

  it('8. vollmacht-unterschreiben: keine Unterschrift vorhanden', () => {
    const a = getKundenJetztZuTun(
      makeFall({
        sa_unterschrieben: false,
        vollmacht_signiert_am: null,
        vollmacht_status: null,
      }),
    )
    expect(a?.state).toBe('vollmacht-unterschreiben')
  })

  it('9. vs-antwort-abwarten: anschlussschreiben_am gesetzt, keine regulierung', () => {
    const a = getKundenJetztZuTun(
      makeFall({
        anschlussschreiben_am: new Date('2026-04-01').toISOString(),
        regulierung_am: null,
        status: 'anschlussschreiben-versendet',
      }),
    )
    expect(a?.state).toBe('vs-antwort-abwarten')
    expect(a?.variant).toBe('info')
  })

  it('10. fall-abgeschlossen: innerhalb 30d sichtbar', () => {
    const a = getKundenJetztZuTun(
      makeFall({ status: 'abgeschlossen', abgeschlossen_am: new Date().toISOString() }),
    )
    expect(a?.state).toBe('fall-abgeschlossen')
    expect(a?.variant).toBe('info')
  })

  it('10b. fall-abgeschlossen: nach 30d → null (minimalisiert)', () => {
    const alt = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString()
    const a = getKundenJetztZuTun(
      makeFall({ status: 'abgeschlossen', abgeschlossen_am: alt }),
    )
    expect(a).toBeNull()
  })

  it('11. kein-aktionsbedarf: alles erledigt, keine Aktion', () => {
    const a = getKundenJetztZuTun(
      makeFall({
        onboarding_complete: true,
        sa_unterschrieben: true,
        vollmacht_signiert_am: new Date('2026-04-01').toISOString(),
        status: 'sv-zugewiesen',
      }),
    )
    expect(a?.state).toBe('kein-aktionsbedarf')
    expect(a?.variant).toBe('info')
  })

  it('Priority: onboarding-offen schlägt pflichtdokumente-offen', () => {
    const a = getKundenJetztZuTun(
      makeFall({ onboarding_complete: false, hat_offene_nachreichung: true }),
    )
    expect(a?.state).toBe('onboarding-offen')
  })

  it('Priority: SLA-Breach schlägt Vollmacht', () => {
    const sla: KundeSlaRecord[] = [
      { fall_id: 'fall-test-1', blocker_rolle: 'kunde', status: 'breached' },
    ]
    const a = getKundenJetztZuTun(
      makeFall({ sa_unterschrieben: false, vollmacht_signiert_am: null }),
      sla,
    )
    expect(a?.state).toBe('daten-an-kanzlei')
  })

  it('SLA-Boost: Breach nur wenn blocker_rolle=kunde (nicht sv)', () => {
    const sla: KundeSlaRecord[] = [
      { fall_id: 'fall-test-1', blocker_rolle: 'sv', status: 'breached' },
    ]
    const a = getKundenJetztZuTun(makeFall(), sla)
    expect(a?.state).not.toBe('daten-an-kanzlei')
  })

  it('Storno: gibt null zurück', () => {
    const a = getKundenJetztZuTun(makeFall({ status: 'storniert' }))
    expect(a).toBeNull()
  })

  it('termin-vor-ort via sv_termin-Fenster (kein expliziter Flag)', () => {
    // Termin vor 30 Minuten → innerhalb des +2h-Fensters
    const vorMin = new Date(Date.now() - 30 * 60 * 1000).toISOString()
    const a = getKundenJetztZuTun(makeFall({ sv_termin: vorMin }))
    expect(a?.state).toBe('termin-vor-ort')
    expect(a?.variant).toBe('live')
  })
})
