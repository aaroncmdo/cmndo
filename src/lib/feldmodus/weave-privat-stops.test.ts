import { describe, it, expect } from 'vitest'
import { weavePrivatStops } from './weave-privat-stops'

type S = { id: string; start_zeit: string; index: number; kind: 'termin' | 'privat' }
const t = (id: string, iso: string, index: number): S => ({ id, start_zeit: `2026-07-08T${iso}:00`, index, kind: 'termin' })
const p = (id: string, iso: string): S => ({ id, start_zeit: `2026-07-08T${iso}:00`, index: 0, kind: 'privat' })

describe('weavePrivatStops', () => {
  it('ohne Privat-Stops -> exakt die termineStops-Liste (Referenz-Identitaet)', () => {
    const termine = [t('a', '09:00', 0), t('b', '13:00', 1)]
    const out = weavePrivatStops(termine, [])
    expect(out).toBe(termine) // dieselbe Referenz -> Termin-Flow garantiert unangetastet
  })

  it('Privat-Stop zwischen zwei Terminen wird zeitlich eingewoben', () => {
    const termine = [t('a', '09:00', 0), t('b', '15:00', 1)]
    const privat = [p('x', '12:00')]
    const out = weavePrivatStops(termine, privat)
    expect(out.map((s) => s.id)).toEqual(['a', 'x', 'b'])
    expect(out.map((s) => s.index)).toEqual([0, 1, 2]) // re-indexed
  })

  it('Privat-Stop vor allen Terminen -> zuerst', () => {
    const out = weavePrivatStops([t('a', '10:00', 0)], [p('x', '08:00')])
    expect(out.map((s) => s.id)).toEqual(['x', 'a'])
  })

  it('Privat-Stop nach dem letzten Termin -> zuletzt', () => {
    const out = weavePrivatStops([t('a', '10:00', 0)], [p('x', '18:00')])
    expect(out.map((s) => s.id)).toEqual(['a', 'x'])
  })

  it('zeitgleich mit einem Termin -> Privat zuerst (<=)', () => {
    const out = weavePrivatStops([t('a', '10:00', 0)], [p('x', '10:00')])
    expect(out.map((s) => s.id)).toEqual(['x', 'a'])
  })

  it('mehrere Privat-Stops werden korrekt nach Zeit verteilt + re-indexed', () => {
    const termine = [t('a', '09:00', 0), t('b', '13:00', 1), t('c', '17:00', 2)]
    const privat = [p('z', '18:00'), p('y', '11:00'), p('x', '07:00')] // unsortiert rein
    const out = weavePrivatStops(termine, privat)
    expect(out.map((s) => s.id)).toEqual(['x', 'a', 'y', 'b', 'c', 'z'])
    expect(out.map((s) => s.index)).toEqual([0, 1, 2, 3, 4, 5])
  })

  it('Termine bleiben in Eingangs-Reihenfolge (auch bei nicht-zeitsortierter Eingabe)', () => {
    // Termine bewusst NICHT zeitsortiert (manuelle Reihenfolge) — die Fn sortiert Termine NICHT um.
    const termine = [t('spaet', '15:00', 0), t('frueh', '09:00', 1)]
    const out = weavePrivatStops(termine, [p('x', '12:00')])
    // Privat (12:00) <= erster Termin (15:00) -> davor. Termin-Reihenfolge bleibt spaet, frueh.
    expect(out.map((s) => s.id)).toEqual(['x', 'spaet', 'frueh'])
  })
})
