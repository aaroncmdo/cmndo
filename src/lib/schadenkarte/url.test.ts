import { describe, it, expect, afterEach } from 'vitest'
import { buildSchadenkarteUrl } from './url'

const ORIG = process.env.NEXT_PUBLIC_APP_URL

afterEach(() => {
  if (ORIG === undefined) delete process.env.NEXT_PUBLIC_APP_URL
  else process.env.NEXT_PUBLIC_APP_URL = ORIG
})

describe('buildSchadenkarteUrl', () => {
  // REGRESSIONSSPERRE. Die alte URL (claimondo.de/schaden/...) liefert auf prod 404 --
  // das ist die Marketing-Seite (nginx :3006), die App laeuft auf app.claimondo.de (:3000).
  // Diese URL wird auf PHYSISCHES PLASTIK gedruckt/geschrieben und ist danach nicht mehr
  // aenderbar. Faellt dieser Test, ist jede produzierte Karte unbrauchbar.
  it('zeigt auf die APP-Domain, nicht auf die Marketing-Domain', () => {
    delete process.env.NEXT_PUBLIC_APP_URL // == prod: der Key ist auf dem VPS NICHT gesetzt
    const url = buildSchadenkarteUrl('SKT-ABCDEFGH23456789')

    expect(url).toBe('https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789')
    expect(url).not.toMatch(/^https:\/\/claimondo\.de/)
  })

  it('respektiert NEXT_PUBLIC_APP_URL, wenn gesetzt', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.staging.claimondo.de'
    expect(buildSchadenkarteUrl('SKT-ABCDEFGH23456789')).toBe(
      'https://app.staging.claimondo.de/schaden/SKT-ABCDEFGH23456789',
    )
  })

  it('erzeugt keinen doppelten Slash bei Trailing-Slash in der Env', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de/'
    expect(buildSchadenkarteUrl('SKT-ABCDEFGH23456789')).toBe(
      'https://app.claimondo.de/schaden/SKT-ABCDEFGH23456789',
    )
  })
})
