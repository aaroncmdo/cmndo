import { describe, it, expect } from 'vitest'
import {
  sindTier2DocsGeprueft,
  tier2FreigabeErlaubt,
  berechneTier2Patch,
  berechneVerifiziertPatch,
} from '../tier2-docs'

// Thenable-Builder-Mock: from().select().eq().eq().in() → { data } (Muster queries.test.ts).
function mockDb(rows: Array<{ dokument_typ: string }>) {
  const b: Record<string, unknown> = {}
  b.from = () => b
  b.select = () => b
  b.eq = () => b
  b.in = () => Promise.resolve({ data: rows })
  return b as never
}

describe('sindTier2DocsGeprueft', () => {
  it('true wenn beide Slots geprueft', async () => {
    const db = mockDb([{ dokument_typ: 'sv_berufshaftpflicht' }, { dokument_typ: 'sv_gewerbeanmeldung' }])
    expect(await sindTier2DocsGeprueft(db, 'sv-1')).toBe(true)
  })
  it('false wenn nur ein Slot geprueft', async () => {
    const db = mockDb([{ dokument_typ: 'sv_berufshaftpflicht' }])
    expect(await sindTier2DocsGeprueft(db, 'sv-1')).toBe(false)
  })
  it('false wenn kein Slot geprueft', async () => {
    expect(await sindTier2DocsGeprueft(mockDb([]), 'sv-1')).toBe(false)
  })
})

describe('berechneTier2Patch', () => {
  const JETZT = Date.UTC(2026, 7, 8) // 2026-08-08
  it('geprueft → status geprueft, keine Frist', () => {
    expect(berechneTier2Patch(true, 'ausstehend', null, JETZT)).toEqual({ verifizierung_status: 'geprueft' })
  })
  it('nicht geprueft + keine Frist → ausstehend + 14-Tage-Frist', () => {
    const p = berechneTier2Patch(false, null, null, JETZT)
    expect(p.verifizierung_status).toBe('ausstehend')
    expect(p.verifizierung_frist_bis).toBe(new Date(JETZT + 14 * 864e5).toISOString())
  })
  it('nicht geprueft + bestehende Frist → ausstehend, Frist NICHT ueberschrieben', () => {
    const p = berechneTier2Patch(false, 'ausstehend', '2026-08-20T00:00:00.000Z', JETZT)
    expect(p).toEqual({ verifizierung_status: 'ausstehend' })
  })
  it('frist_ueberschritten → leerer Patch (nicht zuruecksetzen)', () => {
    expect(berechneTier2Patch(false, 'frist_ueberschritten', '2026-05-01T00:00:00.000Z', JETZT)).toEqual({})
  })
})

describe('tier2FreigabeErlaubt', () => {
  it('true wenn beide hochgeladen oder geprueft', () => {
    expect(
      tier2FreigabeErlaubt([
        { dokument_typ: 'sv_berufshaftpflicht', status: 'hochgeladen' },
        { dokument_typ: 'sv_gewerbeanmeldung', status: 'geprueft' },
      ]),
    ).toBe(true)
  })
  it('false wenn ein Slot noch ausstehend', () => {
    expect(
      tier2FreigabeErlaubt([
        { dokument_typ: 'sv_berufshaftpflicht', status: 'hochgeladen' },
        { dokument_typ: 'sv_gewerbeanmeldung', status: 'ausstehend' },
      ]),
    ).toBe(false)
  })
  it('false wenn ein Slot ganz fehlt', () => {
    expect(tier2FreigabeErlaubt([{ dokument_typ: 'sv_berufshaftpflicht', status: 'geprueft' }])).toBe(false)
  })
})

// Regression 31.08.2026: `verifiziert` ist die ZWEITE Verifizierungs-Achse und die
// einzige, die der Kunde sieht (gruenes "Verifiziert"-Badge in der Fallakte) bzw. die
// das Whitelabel-Gate oeffnet. Der Enforcement-Fix vom 08.08. band nur
// `verifizierung_status` an die Doc-Pruefung; `verifiziert` blieb blind auf true.
// Auf prod gemessen: 4 SVs mit verifiziert=true + status='ausstehend' + verifiziert_von=NULL.
describe('berechneVerifiziertPatch', () => {
  const JETZT_ISO = '2026-08-31T12:00:00.000Z'

  it('Docs geprueft -> setzt verifiziert + Zeitstempel', () => {
    expect(berechneVerifiziertPatch(true, JETZT_ISO)).toEqual({
      verifiziert: true,
      verifiziert_am: JETZT_ISO,
    })
  })

  it('Docs NICHT geprueft -> leerer Patch, das Feld wird gar nicht angefasst', () => {
    expect(berechneVerifiziertPatch(false, JETZT_ISO)).toEqual({})
  })

  it('setzt NIE auf false — ein erneuter Lauf darf ein echtes Siegel nicht entziehen', () => {
    const patch = berechneVerifiziertPatch(false, JETZT_ISO)
    expect('verifiziert' in patch).toBe(false)
    expect('verifiziert_am' in patch).toBe(false)
  })

  it('laeuft synchron mit berechneTier2Patch: nie verifiziert=true bei status ausstehend', () => {
    const jetztMs = Date.UTC(2026, 7, 31)
    for (const geprueft of [true, false]) {
      const statusPatch = berechneTier2Patch(geprueft, null, null, jetztMs)
      const flagPatch = berechneVerifiziertPatch(geprueft, JETZT_ISO)
      const zusammen = { ...flagPatch, ...statusPatch }
      if (zusammen.verifizierung_status === 'ausstehend') {
        expect(zusammen.verifiziert).toBeUndefined()
      }
      if (zusammen.verifiziert === true) {
        expect(zusammen.verifizierung_status).toBe('geprueft')
      }
    }
  })
})
