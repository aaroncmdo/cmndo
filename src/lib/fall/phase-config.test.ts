import { describe, expect, it } from 'vitest'
import { getVisibleSections, PHASE_VISIBLE_SECTIONS } from './phase-config'
import { canEditField, hasAnyEditPermission } from '@/lib/permissions'

// CMM-69: getVisibleSections + Edit-Lock lesen jetzt die abgeleitete sub_phase
// (v_claim_phase) statt fall_status. Invariante: nie weniger als BASIS; großzügig
// in Regulierung; alle Terminals zeigen alles.
const BASIS = ['kunde', 'fahrzeug', 'unfall', 'gegner', 'vorschaeden', 'versicherung']

describe('getVisibleSections (CMM-69: sub_phase → Sektionen)', () => {
  it('Erfassung (sa_offen) = BASIS', () => {
    expect([...getVisibleSections('sa_offen')].sort()).toEqual([...BASIS].sort())
  })

  it('Begutachtung (termin) zeigt Besichtigung', () => {
    expect(getVisibleSections('termin')).toContain('besichtigung')
  })

  it('Regulierung (versicherungskontakt) zeigt großzügig Kürzung/Rüge/Stellungnahme/Nachbesichtigung', () => {
    const s = getVisibleSections('versicherungskontakt')
    for (const sec of ['kuerzung', 'ruege', 'stellungnahme', 'nachbesichtigung', 'regulierung']) {
      expect(s).toContain(sec)
    }
  })

  it('Terminal (erfolgreich_reguliert/storniert/klage_rechtsstreit) zeigt ALLE Sektionen inkl. klage', () => {
    for (const t of ['erfolgreich_reguliert', 'storniert', 'klage_rechtsstreit', 'verjaehrt']) {
      expect(getVisibleSections(t)).toContain('klage')
      expect(getVisibleSections(t).length).toBeGreaterThanOrEqual(16)
    }
  })

  it('null / unbekannt → BASIS (defensive default)', () => {
    expect([...getVisibleSections(null)].sort()).toEqual([...BASIS].sort())
    expect([...getVisibleSections('quatsch')].sort()).toEqual([...BASIS].sort())
  })

  it('FLOOR: vollmacht_offen + SV-Termin → besichtigung sichtbar (Drift-Schutz, 56/75 live)', () => {
    expect(getVisibleSections('vollmacht_offen')).not.toContain('besichtigung')
    expect(getVisibleSections('vollmacht_offen', { hasTermin: true })).toContain('besichtigung')
  })

  it('FLOOR: vollmacht_offen + Gutachten → besichtigung + kernwerte sichtbar', () => {
    const s = getVisibleSections('vollmacht_offen', { hasGutachten: true })
    expect(s).toContain('besichtigung')
    expect(s).toContain('kernwerte')
  })

  it('Invariante: jede gemappte sub_phase enthält ALLE BASIS-Sektionen (nie weniger)', () => {
    for (const [sub, secs] of Object.entries(PHASE_VISIBLE_SECTIONS)) {
      for (const b of BASIS) {
        expect(secs, `sub_phase ${sub} fehlt BASIS-Sektion ${b}`).toContain(b)
      }
    }
  })
})

describe('canEditField / hasAnyEditPermission Terminal-Lock (CMM-69)', () => {
  it('aktiv (termin) → editierbar (admin)', () => {
    expect(canEditField('admin', 'kunde_name', 'termin')).toBe(true)
    expect(hasAnyEditPermission('admin', 'termin')).toBe(true)
  })

  it('terminal (erfolgreich_reguliert / storniert) → read-only', () => {
    expect(canEditField('admin', 'kunde_name', 'erfolgreich_reguliert')).toBe(false)
    expect(canEditField('admin', 'kunde_name', 'storniert')).toBe(false)
    expect(hasAnyEditPermission('admin', 'storniert')).toBe(false)
  })

  it('klage_rechtsstreit NICHT gelockt (faithful zum alten Lock = nur abgeschlossen/storniert)', () => {
    expect(canEditField('admin', 'kunde_name', 'klage_rechtsstreit')).toBe(true)
  })
})
