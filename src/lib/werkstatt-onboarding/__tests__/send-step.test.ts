// Werkstatt-Onboarding-Drip — sendeStep: rendert + versendet EINEN faelligen Step.
// Externe IO (sendEmail, react-email render, Opt-out-Token) gemockt — getestet wird
// NUR die eigene Logik: Skip-Faelle (kein SV / invalide Copy) + der Erfolgs-/Fehler-Pfad.
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/email/google/client', () => ({ sendEmail: vi.fn() }))
vi.mock('@react-email/render', () => ({ render: vi.fn() }))
// Eigenes Krypto-/Env-Detail (COLD_MAIL_OPTOUT_SECRET) ist fuer sendeStep irrelevant —
// gemockt, damit der Test nicht von einem Secret in der Test-Umgebung abhaengt.
vi.mock('@/lib/cold-mail/optout-token', () => ({ createOptoutToken: vi.fn(() => 'TOKEN123') }))

import { sendEmail } from '@/lib/email/google/client'
import { render } from '@react-email/render'
import { sendeStep } from '../send-step'

const merge = { werkstattName: 'Muster GmbH', ansprechpartner: 'Nicolas', tel: '+49 170', portalLink: 'https://app.claimondo.de/werkstatt' }

const stepSv = {
  position: 3,
  template_key: 'sv_vorstellung' as const,
  betreff: 'Dein Gutachter in [Region]: [Gutachter-Name]',
  preheader: 'P',
  copy: { headline: 'h', absaetze: ['a'], cta_label: 'c' },
}

const stepWillkommen = {
  position: 1,
  template_key: 'willkommen' as const,
  betreff: 'Willkommen bei Claimondo',
  preheader: 'P',
  copy: { headline: 'h', absaetze: ['a'], so_laeufts: ['x'], cta_label: 'c' },
}

describe('sendeStep', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset()
    vi.mocked(render).mockReset()
    vi.mocked(render).mockResolvedValue('<html>mock</html>')
  })

  it('skip kein_sv bei sv_vorstellung ohne merge.sv', async () => {
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepSv, merge: { ...merge, sv: null } })
    expect(r).toEqual({ ok: true, skipped: 'kein_sv' })
    expect(sendEmail).not.toHaveBeenCalled()
    expect(render).not.toHaveBeenCalled()
  })

  it('skip copy_invalid bei invalider Copy (kein Send)', async () => {
    const kaputt = { ...stepWillkommen, copy: { headline: 'h' } } // absaetze/so_laeufts/cta_label fehlen
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: kaputt, merge })
    expect(r).toEqual({ ok: false, skipped: 'copy_invalid' })
    expect(sendEmail).not.toHaveBeenCalled()
  })

  it('sendet bei sv_vorstellung MIT merge.sv', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ messageId: 'msg-1' })
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepSv, merge: { ...merge, sv: { name: 'Kelvin', region: 'Köln' } } })
    expect(r).toEqual({ ok: true })
    expect(render).toHaveBeenCalledOnce()
    expect(sendEmail).toHaveBeenCalledOnce()
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.to).toBe('w@test.de')
    expect(call.subject).toBe(stepSv.betreff)
    expect(call.html).toBe('<html>mock</html>')
    expect(call.template).toBe('werkstatt_aktivierung_sv_vorstellung')
    expect(call.empfaengerTyp).toBe('werkstatt')
    expect(call.listUnsubscribe).toContain('/partner-abmelden/TOKEN123')
  })

  it('sendet bei einem Nicht-SV-Template mit valider Copy', async () => {
    vi.mocked(sendEmail).mockResolvedValue({ messageId: 'msg-2' })
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepWillkommen, merge })
    expect(r).toEqual({ ok: true })
    const call = vi.mocked(sendEmail).mock.calls[0][0]
    expect(call.template).toBe('werkstatt_aktivierung_willkommen')
  })

  it('faengt einen sendEmail-Fehlschlag als Result ab (kein throw)', async () => {
    vi.mocked(sendEmail).mockRejectedValue(new Error('SMTP down'))
    const r = await sendeStep({ empfaengerEmail: 'w@test.de', step: stepWillkommen, merge })
    expect(r.ok).toBe(false)
    expect(r.error).toBe('SMTP down')
  })
})
