import { describe, expect, it } from 'vitest'
import { GESAMTPUNKTE, MODULE, TEILBEFUND_SCHWELLE, modulNachId } from '../registry'

describe('Modul-Registry', () => {
  it('enthaelt genau 17 Module', () => {
    expect(MODULE).toHaveLength(17)
  })

  it('summiert auf 150 Punkte', () => {
    expect(MODULE.reduce((s, m) => s + m.punkte, 0)).toBe(150)
    expect(GESAMTPUNKTE).toBe(150)
  })

  it('setzt die Teilbefund-Schwelle auf 50 Prozent', () => {
    expect(TEILBEFUND_SCHWELLE).toBe(75)
  })

  it('haelt die Modul-Ids aus der Spec ein', () => {
    expect(MODULE.map((m) => m.id).sort()).toEqual(
      ['ads','gbp','gebiet','gsc','kwg','kwm','markt','nach','nische','ortsseiten',
       'seo','ux','verz','volumen','web','wett','zuweiser'],
    )
  })

  it('vergibt keine doppelten Ids', () => {
    expect(new Set(MODULE.map((m) => m.id)).size).toBe(MODULE.length)
  })

  it('kennt gbp mit 22 Punkten nur im Bestand-Modus', () => {
    const gbp = modulNachId('gbp')
    expect(gbp?.punkte).toBe(22)
    expect(gbp?.modi).toEqual(['bestand'])
  })

  it('fuehrt markt, nische, volumen, gebiet und ortsseiten ohne Punktwertung', () => {
    const ohnePunkte = MODULE.filter((m) => m.punkte === 0).map((m) => m.id).sort()
    expect(ohnePunkte).toEqual(['gebiet','markt','nische','ortsseiten','volumen'])
  })

  it('legt gebiet nur auf den Aufbau-Weg', () => {
    expect(modulNachId('gebiet')?.modi).toEqual(['aufbau'])
  })
})
