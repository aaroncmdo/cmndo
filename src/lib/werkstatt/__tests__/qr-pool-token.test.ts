import { describe, it, expect } from 'vitest'
import { generateQrPoolToken, extractQrPoolToken } from '../qr-pool-token'

describe('generateQrPoolToken', () => {
  it('Format WQR- + 8 Zeichen aus dem Alphabet', () => {
    expect(generateQrPoolToken()).toMatch(/^WQR-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{8}$/)
  })
  it('keine verwechselbaren Zeichen (0/1/I/L/O/U)', () => {
    for (let i = 0; i < 100; i++) {
      expect(generateQrPoolToken().slice(4)).not.toMatch(/[01ILOU]/)
    }
  })
  it('ist praktisch eindeutig (200 ohne Kollision)', () => {
    const set = new Set(Array.from({ length: 200 }, () => generateQrPoolToken()))
    expect(set.size).toBe(200)
  })
})

describe('extractQrPoolToken', () => {
  it('aus voller URL', () => {
    expect(extractQrPoolToken('https://app.claimondo.de/start/werkstatt-qr/WQR-ABCD2345')).toBe('WQR-ABCD2345')
  })
  it('aus bare Token (case-insensitive normalisiert)', () => {
    expect(extractQrPoolToken('  wqr-abcd2345 ')).toBe('WQR-ABCD2345')
  })
  it('null bei Unsinn / leer', () => {
    expect(extractQrPoolToken('hallo welt')).toBeNull()
    expect(extractQrPoolToken('')).toBeNull()
    expect(extractQrPoolToken('https://app.claimondo.de/start/werkstatt/xyz')).toBeNull()
  })
})
