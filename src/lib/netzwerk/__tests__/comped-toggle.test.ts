import { describe, expect, test } from 'vitest'
import { entscheideCompedToggle, type AboRowMin } from '../comped-toggle'

// Admin-Comped-Toggle (Netzwerkpartner): pure Entscheidungslogik.
// Zentrale Invariante: Stripe-gefuehrte Status (aktiv/ueberfaellig) werden vom
// Admin-Toggle NIE angefasst — comped ist der einzige admin-gefuehrte Status.
// Multi-Row-tolerant (sv_id hat KEIN Unique — Historie-Rows moeglich).

const row = (id: string, status: string): AboRowMin => ({ id, status })
const rowB = (id: string, status: string, gueltigBis: string | null): AboRowMin => ({ id, status, gueltigBis })
const NOW = new Date('2026-08-08T00:00:00Z')
const VERGANGEN = '2020-01-01T00:00:00Z'
const ZUKUNFT = '2999-01-01T00:00:00Z'

describe('entscheideCompedToggle — setzen', () => {
  test('keine Rows -> insert_comped', () => {
    expect(entscheideCompedToggle([], 'setzen')).toEqual({ ok: true, aktion: 'insert_comped' })
  })

  test('nur inaktiv-Row -> insert_comped (neue Row, Historie bleibt)', () => {
    expect(entscheideCompedToggle([row('a', 'inaktiv')], 'setzen'))
      .toEqual({ ok: true, aktion: 'insert_comped' })
  })

  test('nur gekuendigt-Row -> insert_comped (Deal nach Kuendigung legitim)', () => {
    expect(entscheideCompedToggle([row('a', 'gekuendigt')], 'setzen'))
      .toEqual({ ok: true, aktion: 'insert_comped' })
  })

  test('comped vorhanden -> noop', () => {
    const r = entscheideCompedToggle([row('a', 'comped')], 'setzen')
    expect(r).toMatchObject({ ok: true, aktion: 'noop' })
  })

  test('aktiv (Stripe) vorhanden -> Fehler mit Stripe-Hinweis', () => {
    const r = entscheideCompedToggle([row('a', 'aktiv')], 'setzen')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Stripe')
  })

  test('ueberfaellig (Stripe-Dunning) vorhanden -> Fehler', () => {
    expect(entscheideCompedToggle([row('a', 'ueberfaellig')], 'setzen').ok).toBe(false)
  })

  test('comped UND aktiv gemischt -> noop (bereits comped gewinnt)', () => {
    const r = entscheideCompedToggle([row('a', 'comped'), row('b', 'aktiv')], 'setzen')
    expect(r).toMatchObject({ ok: true, aktion: 'noop' })
  })

  test('befristetes comped in Zukunft -> noop (aktiv, blockt)', () => {
    expect(entscheideCompedToggle([rowB('a', 'comped', ZUKUNFT)], 'setzen', NOW))
      .toMatchObject({ ok: true, aktion: 'noop' })
  })

  test('abgelaufenes comped -> insert_comped (Erneuerung erlaubt)', () => {
    expect(entscheideCompedToggle([rowB('a', 'comped', VERGANGEN)], 'setzen', NOW))
      .toEqual({ ok: true, aktion: 'insert_comped' })
  })
})

describe('entscheideCompedToggle — entziehen', () => {
  test('eine comped-Row -> set_inaktiv mit deren Id', () => {
    expect(entscheideCompedToggle([row('a', 'comped')], 'entziehen'))
      .toEqual({ ok: true, aktion: 'set_inaktiv', rowIds: ['a'] })
  })

  test('mehrere comped-Rows -> set_inaktiv mit allen Ids', () => {
    expect(entscheideCompedToggle([row('a', 'comped'), row('b', 'comped')], 'entziehen'))
      .toEqual({ ok: true, aktion: 'set_inaktiv', rowIds: ['a', 'b'] })
  })

  test('comped + aktiv gemischt -> nur die comped-Row wird inaktiv (Stripe-Row unberuehrt)', () => {
    expect(entscheideCompedToggle([row('a', 'comped'), row('b', 'aktiv')], 'entziehen'))
      .toEqual({ ok: true, aktion: 'set_inaktiv', rowIds: ['a'] })
  })

  test('abgelaufenes comped + entziehen -> set_inaktiv (Cleanup der Alt-Row)', () => {
    expect(entscheideCompedToggle([rowB('a', 'comped', VERGANGEN)], 'entziehen', NOW))
      .toEqual({ ok: true, aktion: 'set_inaktiv', rowIds: ['a'] })
  })

  test('nur aktiv (Stripe) -> Fehler mit Stripe-Kuendigungs-Hinweis', () => {
    const r = entscheideCompedToggle([row('a', 'aktiv')], 'entziehen')
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toContain('Stripe')
  })

  test('keine Rows -> Fehler (nichts zu entziehen)', () => {
    expect(entscheideCompedToggle([], 'entziehen').ok).toBe(false)
  })

  test('nur inaktiv -> Fehler (kein comped vorhanden)', () => {
    expect(entscheideCompedToggle([row('a', 'inaktiv')], 'entziehen').ok).toBe(false)
  })
})
