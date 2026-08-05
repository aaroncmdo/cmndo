import { describe, expect, test } from 'vitest'
import {
  buildPiMatchOrExpr,
  extractPaymentIntentId,
  isTestmodeEvent,
} from './reconcile-payload'

// AAR-929 Reconcile-Payload-Fix: Der Webhook speichert payload = event.data.object
// (FLACHES Objekt, kein Event-Envelope). Der Reconcile-Cron las bisher nur den
// Envelope-Pfad payload.data.object.* -> fand NIE eine PI-Id (5 Dauer-Drifts,
// Report funktional blind). Diese Tests decken beide Formate ab.

describe('extractPaymentIntentId', () => {
  test('flaches PI-Objekt (heutiges Writer-Format) liefert top-level id', () => {
    const payload = { id: 'pi_3TPhMPBNxfaSnPgl3zbIpxsj', object: 'payment_intent', status: 'succeeded' }
    expect(extractPaymentIntentId('payment_intent.succeeded', payload)).toBe('pi_3TPhMPBNxfaSnPgl3zbIpxsj')
  })

  test('flaches Charge-Objekt liefert payment_intent-Feld', () => {
    const payload = { id: 'ch_3TP111', object: 'charge', payment_intent: 'pi_3TP456' }
    expect(extractPaymentIntentId('charge.succeeded', payload)).toBe('pi_3TP456')
  })

  test('Event-Envelope (payment_intent.succeeded) liefert data.object.id', () => {
    const payload = {
      id: 'evt_1AAA',
      data: { object: { id: 'pi_3TP789', object: 'payment_intent' } },
    }
    expect(extractPaymentIntentId('payment_intent.succeeded', payload)).toBe('pi_3TP789')
  })

  test('Event-Envelope (charge.succeeded) liefert data.object.payment_intent', () => {
    const payload = {
      id: 'evt_2BBB',
      data: { object: { id: 'ch_2XYZ', object: 'charge', payment_intent: 'pi_3TPabc' } },
    }
    expect(extractPaymentIntentId('charge.succeeded', payload)).toBe('pi_3TPabc')
  })

  test('PI-Event mit Nicht-pi_-Id (z.B. Event-Id faelschlich top-level) -> null', () => {
    // Schutz gegen die umgekehrte Verwechslung: ein Envelope ohne data.object
    // hat top-level id = evt_... — das darf NIE als PI-Id durchgehen.
    const payload = { id: 'evt_3CCC', object: 'event' }
    expect(extractPaymentIntentId('payment_intent.succeeded', payload)).toBeNull()
  })

  test('Charge ohne payment_intent -> null', () => {
    const payload = { id: 'ch_9', object: 'charge', payment_intent: null }
    expect(extractPaymentIntentId('charge.succeeded', payload)).toBeNull()
  })

  test('kaputter/leerer Payload -> null', () => {
    expect(extractPaymentIntentId('payment_intent.succeeded', null)).toBeNull()
    expect(extractPaymentIntentId('payment_intent.succeeded', undefined)).toBeNull()
    expect(extractPaymentIntentId('payment_intent.succeeded', 'kein-objekt')).toBeNull()
    expect(extractPaymentIntentId('payment_intent.succeeded', {})).toBeNull()
  })

  test('Envelope mit data aber ohne object -> null (kein Fallback auf evt_-Id)', () => {
    const payload = { id: 'evt_4DDD', data: {} }
    expect(extractPaymentIntentId('payment_intent.succeeded', payload)).toBeNull()
  })
})

describe('isTestmodeEvent', () => {
  test('flaches Objekt mit livemode=false -> true', () => {
    expect(isTestmodeEvent({ id: 'pi_1', livemode: false })).toBe(true)
  })

  test('flaches Objekt mit livemode=true -> false', () => {
    expect(isTestmodeEvent({ id: 'pi_1', livemode: true })).toBe(false)
  })

  test('Envelope mit data.object.livemode=false -> true', () => {
    expect(isTestmodeEvent({ id: 'evt_1', data: { object: { livemode: false } } })).toBe(true)
  })

  test('livemode fehlt -> false (konservativ: lieber melden als verschlucken)', () => {
    expect(isTestmodeEvent({ id: 'pi_1' })).toBe(false)
    expect(isTestmodeEvent(null)).toBe(false)
    expect(isTestmodeEvent('kein-objekt')).toBe(false)
  })
})

describe('buildPiMatchOrExpr', () => {
  test('valide PI-Id -> or-Ausdruck deckt flach+Envelope, PI+Charge (4 Zweige)', () => {
    expect(buildPiMatchOrExpr('pi_3TPx1')).toBe(
      'payload->>id.eq.pi_3TPx1,' +
      'payload->>payment_intent.eq.pi_3TPx1,' +
      'payload->data->object->>id.eq.pi_3TPx1,' +
      'payload->data->object->>payment_intent.eq.pi_3TPx1'
    )
  })

  test('unerwartetes Id-Format (PostgREST-Sonderzeichen / leer) -> null', () => {
    expect(buildPiMatchOrExpr('pi_x,or.1=1')).toBeNull()
    expect(buildPiMatchOrExpr('pi mit leerzeichen')).toBeNull()
    expect(buildPiMatchOrExpr('')).toBeNull()
    expect(buildPiMatchOrExpr('sonst-was(')).toBeNull()
  })
})
