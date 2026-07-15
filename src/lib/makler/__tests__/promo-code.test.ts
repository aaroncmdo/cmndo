import { describe, it, expect, vi } from 'vitest'

// promo-code.ts ist 'server-only' (wirft ausserhalb der RSC-Umgebung) -> inline neutralisieren.
vi.mock('server-only', () => ({}))

import { generatePromoCode } from '../promo-code'

describe('generatePromoCode', () => {
  it('liefert IMMER MK- + genau 4 Zeichen (kanonisches Format, Aaron 15.07.)', () => {
    for (let i = 0; i < 500; i++) {
      const code = generatePromoCode()
      expect(code).toMatch(/^MK-[A-Z0-9]{4}$/)
      expect(code.length).toBe(7) // 'MK-' (3) + 4
    }
  })

  it('nutzt nur das verwechslungsarme Alphabet (kein I/O/0/1)', () => {
    for (let i = 0; i < 500; i++) {
      const suffix = generatePromoCode().slice(3)
      expect(suffix).not.toMatch(/[IO01]/)
    }
  })
})
