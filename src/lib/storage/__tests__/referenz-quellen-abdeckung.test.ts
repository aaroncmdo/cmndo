import { describe, it, expect } from 'vitest'
import { REFERENZ_QUELLEN, aufloesen } from '@/lib/storage/referenz-check'

// Die 6 real gemessenen relativen Werte (28.08., alle in `fall-dokumente` nachgesehen).
const REAL: Array<[string, string, string]> = [
  ['leads', 'polizeibericht_url', 'leads/f44ab2ce/polizeibericht_1784240738750.jpg'],
  ['leads', 'polizeibericht_url', 'leads/bea4fa1d/polizeibericht_flow_1786293984101.jpg'],
  ['leads', 'zb1_url', 'leads/bea4fa1d/zb1_flow_1786294077662.webp'],
  ['leads', 'zeugenaussage_url', 'leads/bea4fa1d/zeugenaussage_flow_1786294027700.jpg'],
  ['auftraege', 'gutachten_url', 'claims/fbc10002/gutachten/fba00002.pdf'],
  ['kanzlei_faelle', 'anschlussschreiben_url', 'faelle/fbc10004/anschlussschreiben_1787906689.pdf'],
]

describe('Der Waechter deckt die relativen Pfade jetzt ab', () => {
  for (const [tabelle, spalte, wert] of REAL) {
    it(`${tabelle}.${spalte} -> geprueft statt ignoriert`, () => {
      const q = REFERENZ_QUELLEN.find((x) => x.tabelle === tabelle && x.spalte === spalte)
      expect(q, `${tabelle}.${spalte} fehlt in REFERENZ_QUELLEN`).toBeDefined()
      const r = aufloesen(wert, q!.bucket)
      expect(r.art, 'mit bucket:null waere das "extern" — also ungeprueft').toBe('storage')
      if (r.art === 'storage') expect(r.bucket).toBe('fall-dokumente')
    })
  }

  it('/claimondo-logo.svg bleibt korrekt EXTERN — es liegt in keinem Bucket', () => {
    const q = REFERENZ_QUELLEN.find((x) => x.tabelle === 'sachverstaendige' && x.spalte === 'logo_url')
    expect(aufloesen('/claimondo-logo.svg', q!.bucket).art).toBe('extern')
  })
})
