// Werkstatt-Onboarding-Drip — entscheideStepAdvance: reine Advance-Entscheidung nach einem
// sendeStep()-Versuch (Review-Fix Task 13 / FIX 1). Locks the retry behavior: der Cursor darf
// NUR vorruecken, wenn der Step gesendet oder LEGITIM uebersprungen wurde. Ein echter
// Sende-Fehlschlag (ok:false, kein skipped) haelt die Position -> naechster Cron-Tick
// versucht denselben Step erneut (Mirror send-lead-reminders: `if(!ok){failed++; return}`
// VOR dem Update).
import { describe, it, expect } from 'vitest'
import { entscheideStepAdvance } from '../cron-step'

const steps = [
  { position: 1, offset_tage: 0, aktiv: true },
  { position: 2, offset_tage: 3, aktiv: true },
  { position: 3, offset_tage: 10, aktiv: true },
]

const anker = new Date('2026-01-01T00:00:00Z')

describe('entscheideStepAdvance', () => {
  it('res.ok (echter Send) -> advance zum naechsten Step, zaehlt gesendet', () => {
    const d = entscheideStepAdvance({ ok: true }, steps[0], steps, anker)
    expect(d.patch).toEqual({ aktueller_step: 1, next_send_at: '2026-01-04T00:00:00.000Z' })
    expect(d.retryNextStep).toBe(false)
    expect(d.counter).toBe('gesendet')
  })

  it('res.ok am letzten Step -> patch setzt fertig + next_send_at null', () => {
    const d = entscheideStepAdvance({ ok: true }, steps[2], steps, anker)
    expect(d.patch).toEqual({ aktueller_step: 3, status: 'fertig', next_send_at: null })
    expect(d.counter).toBe('gesendet')
  })

  it('skipped=kein_sv -> advance UND retryNextStep (sofort naechsten Step versuchen), kein Zaehler', () => {
    const d = entscheideStepAdvance({ ok: true, skipped: 'kein_sv' }, steps[0], steps, anker)
    expect(d.patch).toEqual({ aktueller_step: 1, next_send_at: '2026-01-04T00:00:00.000Z' })
    expect(d.retryNextStep).toBe(true)
    expect(d.counter).toBeNull()
  })

  it('skipped=copy_invalid -> advance ueber den kaputten Step, aber KEIN Retry im selben Tick, kein Zaehler', () => {
    const d = entscheideStepAdvance({ ok: false, skipped: 'copy_invalid' }, steps[0], steps, anker)
    expect(d.patch).toEqual({ aktueller_step: 1, next_send_at: '2026-01-04T00:00:00.000Z' })
    expect(d.retryNextStep).toBe(false)
    expect(d.counter).toBeNull()
  })

  it('ok:false OHNE skipped (echter SMTP-Fehlschlag) -> HOLD: kein Patch, next_send_at bleibt unangetastet, fehler-Zaehler', () => {
    const d = entscheideStepAdvance({ ok: false, error: 'SMTP down' }, steps[0], steps, anker)
    expect(d.patch).toBeNull()
    expect(d.retryNextStep).toBe(false)
    expect(d.counter).toBe('fehler')
  })
})
