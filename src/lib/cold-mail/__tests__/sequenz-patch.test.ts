import { describe, it, expect } from 'vitest'
import { bauePatchFelder } from '../sequenz-patch'

// Regression 15.07.: ein "Auto-Aufnahme"-Toggle hat das kurz zuvor gesetzte aktiv=true
// aus dem (veralteten) Client-State wieder ueberschrieben -> aktiv sprang still auf
// false, die Sequenz haette nie gesendet. Wurzel = Read-Modify-Write der GANZEN Zeile.
// bauePatchFelder baut jetzt ein partielles Update: NUR was explizit uebergeben ist.

describe('bauePatchFelder', () => {
  it('schreibt beim Toggle NUR das eine Flag (name/rolle immer)', () => {
    expect(bauePatchFelder({ name: 'S', rolle: 'werkstatt', auto_enroll: true })).toEqual({
      name: 'S',
      rolle: 'werkstatt',
      auto_enroll: true,
    })
    // aktiv NICHT im Patch -> der DB-Wert bleibt unangetastet (kein Clobbering).
  })

  it('laesst aktiv unangetastet, wenn nur auto_enroll kommt', () => {
    const p = bauePatchFelder({ name: 'S', rolle: 'werkstatt', auto_enroll: false })
    expect('aktiv' in p).toBe(false)
  })

  it('laesst auto_enroll unangetastet, wenn nur aktiv kommt', () => {
    const p = bauePatchFelder({ name: 'S', rolle: 'werkstatt', aktiv: true })
    expect('auto_enroll' in p).toBe(false)
    expect(p.aktiv).toBe(true)
  })

  it('trimmt den Namen', () => {
    expect(bauePatchFelder({ name: '  S  ', rolle: 'makler' }).name).toBe('S')
  })

  it('false-Flags werden geschrieben (nicht als "fehlt" behandelt)', () => {
    const p = bauePatchFelder({ name: 'S', rolle: 'werkstatt', aktiv: false, auto_enroll: false })
    expect(p).toEqual({ name: 'S', rolle: 'werkstatt', aktiv: false, auto_enroll: false })
  })
})
