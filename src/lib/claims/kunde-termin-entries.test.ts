import { describe, it, expect } from 'vitest'
import { deriveKundeTerminEntries } from './kunde-termin-entries'

const base = {
  id: 't1', start_zeit: '2026-07-21T12:00:00Z', status: 'bestaetigt', typ: 'sv_begutachtung',
  kanal: null, fall_id: 'f1', claim_id: 'c1',
  nachbesichtigung_status: null, nachbesichtigung_termin_datum: null,
}

describe('deriveKundeTerminEntries', () => {
  it('SV-Begutachtung ohne Nachbesichtigung -> 1 Besichtigungs-Eintrag', () => {
    const out = deriveKundeTerminEntries(base)
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: 't1', art: 'sv', terminTyp: 'besichtigung', start: base.start_zeit, fall_id: 'f1' })
  })

  it('kb_beratung -> terminTyp beratung', () => {
    const out = deriveKundeTerminEntries({ ...base, typ: 'kb_beratung' })
    expect(out[0].terminTyp).toBe('beratung')
  })

  it('mit nachbesichtigung_termin_datum -> 2 Eintraege (Besichtigung + Nachbesichtigung)', () => {
    const out = deriveKundeTerminEntries({
      ...base, nachbesichtigung_status: 'termin-gewaehlt', nachbesichtigung_termin_datum: '2026-08-05T09:00:00Z',
    })
    expect(out).toHaveLength(2)
    const nb = out.find(e => e.terminTyp === 'nachbesichtigung')!
    expect(nb.id).toBe('t1:nb')
    expect(nb.start).toBe('2026-08-05T09:00:00Z')
    expect(nb.status).toBe('reserviert')      // termin-gewaehlt -> wartet auf SV
    expect(nb.fall_id).toBe('f1')
  })

  it('nachbesichtigung durchgefuehrt -> status abgeschlossen', () => {
    const out = deriveKundeTerminEntries({
      ...base, nachbesichtigung_status: 'durchgefuehrt', nachbesichtigung_termin_datum: '2026-06-01T09:00:00Z',
    })
    expect(out.find(e => e.terminTyp === 'nachbesichtigung')!.status).toBe('abgeschlossen')
  })
})
