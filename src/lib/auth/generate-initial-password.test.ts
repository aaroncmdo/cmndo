import { describe, it, expect } from 'vitest'
import { generateInitialPassword, ALPHABET } from './generate-initial-password'

// AAR-auth-haertung: Initial-Passwort-Generator MUSS kryptographisch sicher
// sein (CSPRNG, nicht Math.random) und bias-frei mappen — sonst sind
// Kunden-/Staff-Initialpasswoerter vorhersagbar (Account-Takeover).

describe('generateInitialPassword', () => {
  it('Default-Laenge ist 16', () => {
    expect(generateInitialPassword().length).toBe(16)
  })

  it('respektiert eine angeforderte Laenge', () => {
    expect(generateInitialPassword(24).length).toBe(24)
    expect(generateInitialPassword(8).length).toBe(8)
  })

  it('nutzt ausschliesslich Zeichen aus dem verwechslungsarmen Alphabet', () => {
    const pw = generateInitialPassword(200)
    for (const ch of pw) expect(ALPHABET).toContain(ch)
    // keine 0/O/1/I/l (Verwechslungsgefahr)
    expect(pw).not.toMatch(/[0O1Il]/)
  })

  it('zwei Aufrufe liefern unterschiedliche Passwoerter (CSPRNG-Quelle)', () => {
    expect(generateInitialPassword(32)).not.toBe(generateInitialPassword(32))
  })

  it('ist bias-frei: verwirft Bytes >= groesstem Vielfachen, mappt sonst per Modulo', () => {
    const reject = Math.floor(256 / ALPHABET.length) * ALPHABET.length
    // Stub-Stream: akzeptiert(>len → Modulo), verworfen, akzeptiert, verworfen, akzeptiert
    const stream = [ALPHABET.length + 2, reject, 5, 255, 7]
    const fake = () => Buffer.from(stream)
    const pw = generateInitialPassword(3, fake)
    expect(pw).toBe(ALPHABET[2] + ALPHABET[5] + ALPHABET[7])
  })
})
