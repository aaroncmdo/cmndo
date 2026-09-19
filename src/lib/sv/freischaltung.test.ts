import { describe, it, expect } from 'vitest'
import { freischaltungsPatch } from './freischaltung'

// Aaron 19.09.2026: „ich möchte nicht mehr verifizieren … Damit soll er wirklich verifiziert
// und buchbar sein." — EIN Patch für ALLE Freischaltungs-Pfade (Stripe ×3, Gutschein, Sub-SV,
// Basic-Auto-Freigabe, Admin-Nachhol-Weg). Vorher setzte jede Stelle ihre eigene Feldliste,
// zwei davon zusätzlich eine 14-Tage-Frist (zurückgenommen, siehe Soll-Blatt).

const JETZT = '2026-09-19T15:00:00.000Z'

describe('freischaltungsPatch', () => {
  it('schaltet frei UND setzt das Siegel in einem Zug', () => {
    expect(freischaltungsPatch(JETZT)).toEqual({
      portal_zugang_freigeschaltet: true,
      ist_aktiv: true,
      verifiziert: true,
      verifiziert_am: JETZT,
    })
  })

  it('überschreibt ein bestehendes verifiziert_am nicht (Admin-Nachhol-Weg läuft auch erneut)', () => {
    const patch = freischaltungsPatch(JETZT, { verifiziertAmBestehend: '2026-08-01T10:00:00.000Z' })
    expect(patch.verifiziert).toBe(true)
    expect(patch.verifiziert_am).toBe('2026-08-01T10:00:00.000Z')
  })

  it('setzt keine Frist und keinen Tier-2-Status mehr (Option B vom 08.08. zurückgenommen)', () => {
    const patch = freischaltungsPatch(JETZT) as Record<string, unknown>
    expect(patch).not.toHaveProperty('verifizierung_status')
    expect(patch).not.toHaveProperty('verifizierung_frist_bis')
    expect(patch).not.toHaveProperty('verifizierung_frist_ueberschritten_am')
  })
})
