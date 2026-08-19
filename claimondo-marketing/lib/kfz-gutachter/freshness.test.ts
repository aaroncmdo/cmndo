import { describe, expect, it } from 'vitest'
import { getStadtLastUpdatedISO, stadtLastModifiedISO } from './freshness'

// ---------------------------------------------------------------------------
// 19.08.2026: Die Sitemap meldete fuer 169 von 182 Stadtseiten
// `lastmod = 2026-05-24` — darunter frankfurt, das an DIESEM Tag frischen
// Ortsinhalt bekam, und huerth, dessen Seite es seit dem Vortag ueberhaupt
// erst gibt. Dasselbe Datum steht im JSON-LD als `dateModified`.
//
// Ursache ist kein Bug, sondern ein Workflow, der nicht mehr traegt: die Map in
// freshness.ts wird VON HAND gepflegt ("Wer eine Stadt inhaltlich aendert,
// traegt hier ihr Datum"). Seit heute aendert ein Cron taeglich zwei Staedte.
// Ein manueller Pflegeschritt, der taeglich faellig ist, wird nicht gepflegt.
// ---------------------------------------------------------------------------
describe('stadtLastModifiedISO', () => {
  it('nimmt das DB-Datum, wenn es neuer ist als der gepflegte Eintrag', () => {
    expect(stadtLastModifiedISO('frankfurt', '2026-08-19T10:38:00.000Z')).toBe('2026-08-19')
  })

  it('behaelt den gepflegten Eintrag, wenn er neuer ist als die DB', () => {
    // Redaktionelle Pflege darf nicht von einem aelteren Generatorlauf
    // ueberschrieben werden — deshalb das Maximum, nicht "DB gewinnt".
    expect(stadtLastModifiedISO('koeln', '2026-01-01T00:00:00.000Z')).toBe(
      getStadtLastUpdatedISO('koeln'),
    )
  })

  it('faellt ohne DB-Datum auf den bisherigen Wert zurueck', () => {
    for (const db of [undefined, null, '']) {
      expect(stadtLastModifiedISO('stuttgart', db)).toBe(getStadtLastUpdatedISO('stuttgart'))
    }
  })

  it('ignoriert ein unparsbares DB-Datum, statt NaN zu liefern', () => {
    // Ein `Invalid Date` im <lastmod> macht die Sitemap fuer Google ungueltig —
    // schlimmer als ein zu altes Datum.
    expect(stadtLastModifiedISO('stuttgart', 'gestern')).toBe(getStadtLastUpdatedISO('stuttgart'))
  })

  it('liefert immer reines YYYY-MM-DD', () => {
    expect(stadtLastModifiedISO('huerth', '2026-08-19T10:38:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(stadtLastModifiedISO('huerth')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
