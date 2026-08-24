import { describe, expect, it } from 'vitest'
import { GESAMTPUNKTE, MODULE, TEILBEFUND_SCHWELLE, modulNachId } from '../registry'

describe('Modul-Registry', () => {
  it('enthaelt genau 18 Module', () => {
    expect(MODULE).toHaveLength(18)
  })

  it('summiert auf 160 Punkte', () => {
    expect(MODULE.reduce((s, m) => s + m.punkte, 0)).toBe(160)
    expect(GESAMTPUNKTE).toBe(160)
  })

  it('setzt die Teilbefund-Schwelle auf 50 Prozent', () => {
    // ⚠ Gegen die KONSTANTE geprueft, nicht gegen eine abgeschriebene Zahl:
    // jedes neue Modul mit Punkten verschiebt die Schwelle, und der Test soll
    // dann die Regel pruefen, nicht an der Zahl scheitern.
    expect(TEILBEFUND_SCHWELLE).toBe(GESAMTPUNKTE / 2)
    expect(TEILBEFUND_SCHWELLE).toBe(80)
  })

  it('haelt die Modul-Ids aus der Spec ein', () => {
    expect(MODULE.map((m) => m.id).sort()).toEqual(
      ['ads','gbp','gebiet','gsc','ki','kwg','kwm','markt','nach','nische','ortsseiten',
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

  it('kennt ki mit 10 Punkten auf beiden Wegen und verlangt eine Website', () => {
    const ki = modulNachId('ki')
    expect(ki?.punkte).toBe(10)
    expect(ki?.modi).toEqual(['aufbau', 'bestand'])
    // Ohne Website ist nichts zu pruefen — die Sperrlogik muss das Modul
    // verwerfen statt es mit null Punkten zu bewerten (R-B).
    expect(ki?.braucht).toBe('url')
  })

  it('fuehrt markt, nische, volumen, gebiet und ortsseiten ohne Punktwertung', () => {
    const ohnePunkte = MODULE.filter((m) => m.punkte === 0).map((m) => m.id).sort()
    expect(ohnePunkte).toEqual(['gebiet','markt','nische','ortsseiten','volumen'])
  })

  it('legt gebiet nur auf den Aufbau-Weg', () => {
    expect(modulNachId('gebiet')?.modi).toEqual(['aufbau'])
  })
})
