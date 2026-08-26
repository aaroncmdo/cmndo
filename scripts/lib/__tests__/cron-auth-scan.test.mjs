import { describe, it, expect } from 'vitest'
import { scanneCronAuth, entrausche } from '../cron-auth-scan.mjs'

describe('scanneCronAuth — flaggt den unsicheren Direktvergleich', () => {
  it('meldet den klassischen Fall', () => {
    const f = scanneCronAuth('if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) return 401')
    expect(f).toHaveLength(1)
    expect(f[0].grund).toBe('direktvergleich')
  })

  it('meldet den leeren Fallback (?? "")', () => {
    const f = scanneCronAuth("const expected = process.env.CRON_SECRET ?? ''")
    expect(f).toHaveLength(1)
    expect(f[0].grund).toBe('leerer-fallback')
  })

  it('meldet auch doppelte Anfuehrungszeichen', () => {
    expect(scanneCronAuth('const e = process.env.CRON_SECRET ?? ""')).toHaveLength(1)
  })
})

describe('scanneCronAuth — laesst abgesicherte Formen in Ruhe', () => {
  it('!process.env.CRON_SECRET || … ist fail-closed', () => {
    const q = 'if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) return 401'
    expect(scanneCronAuth(q)).toHaveLength(0)
  })

  it('!!process.env.CRON_SECRET && … ist fail-closed', () => {
    const q = 'const ok = !!process.env.CRON_SECRET && authHeader === `Bearer ${process.env.CRON_SECRET}`'
    expect(scanneCronAuth(q)).toHaveLength(0)
  })

  it('const secret + if (!secret) ist fail-closed', () => {
    const q = [
      'const secret = process.env.CRON_SECRET',
      'if (!secret) return false',
      'return header === `Bearer ${secret}`',
    ].join('\n')
    expect(scanneCronAuth(q)).toHaveLength(0)
  })

  it('assertCronAuth-Aufrufe enthalten das Muster gar nicht', () => {
    expect(scanneCronAuth('if (!assertCronAuth(request)) return 401')).toHaveLength(0)
  })

  it('Dateien ohne CRON_SECRET werden sofort verworfen', () => {
    expect(scanneCronAuth('const x = 1')).toHaveLength(0)
  })
})

describe('entrausche — Kommentare duerfen nichts flaggen', () => {
  it('ein erklaerender Zeilenkommentar loest keinen Fund aus', () => {
    const q = '// frueher: authHeader !== `Bearer ${process.env.CRON_SECRET}` — jetzt assertCronAuth\nconst x = 1'
    expect(scanneCronAuth(q)).toHaveLength(0)
  })

  it('ein Blockkommentar ebenfalls nicht', () => {
    const q = '/* Vorher stand hier `Bearer ${process.env.CRON_SECRET}` */\nconst x = 1'
    expect(scanneCronAuth(q)).toHaveLength(0)
  })

  it('entrausche laesst echten Code stehen', () => {
    expect(entrausche('const a = 1 // weg\nconst b = 2')).toContain('const b = 2')
  })

  it('URLs (//) werden nicht als Kommentar missverstanden', () => {
    expect(entrausche("fetch('https://x.de/api')")).toContain('https://x.de/api')
  })
})

describe('scanneCronAuth — Zeilennummern', () => {
  it('meldet die richtige Zeile', () => {
    const q = ['const a = 1', 'const b = 2', 'if (h !== `Bearer ${process.env.CRON_SECRET}`) {}'].join('\n')
    expect(scanneCronAuth(q)[0].zeile).toBe(3)
  })
})
