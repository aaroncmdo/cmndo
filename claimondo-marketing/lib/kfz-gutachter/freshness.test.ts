import { describe, expect, it } from 'vitest'
import { getStadtLastUpdatedISO, stadtLastModifiedISO } from './freshness'
import { STAEDTE } from './staedte'
import STADT_ANLAGEDATUM from './staedte-anlagedatum.json'

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

  it('behaelt den bisherigen Wert, wenn die DB aelter ist', () => {
    // Redaktionelle Pflege darf nicht von einem aelteren Generatorlauf
    // ueberschrieben werden — deshalb das Maximum, nicht "DB gewinnt".
    // ⚠ Konkreter Erwartungswert, kein Selbstvergleich: `f(x, alt) === f(x)`
    // waere auch dann gruen, wenn f Unsinn liefert — solange er konsistent ist.
    expect(stadtLastModifiedISO('koeln', '2026-01-01T00:00:00.000Z')).toBe('2026-06-01')
  })

  it('faellt ohne DB-Datum auf den bisherigen Wert zurueck', () => {
    for (const db of [undefined, null, '']) {
      expect(stadtLastModifiedISO('stuttgart', db)).toBe('2026-06-01')
    }
  })

  it('ignoriert ein unparsbares DB-Datum, statt NaN zu liefern', () => {
    // Ein `Invalid Date` im <lastmod> macht die Sitemap fuer Google ungueltig —
    // schlimmer als ein zu altes Datum.
    expect(stadtLastModifiedISO('stuttgart', 'gestern')).toBe('2026-06-01')
  })

  // -------------------------------------------------------------------------
  // Anlagedatum (20.08.2026)
  //
  // Der gepflegte Default ist 2026-05-24 — aber die AELTESTEN Staedte kamen erst
  // am 01.06. ins Repo, die neuesten am 19.08. Damit meldete JEDE Stadt ohne
  // eigenen Override ein `lastmod` VOR ihrer eigenen Entstehung. Nicht bloss
  // veraltet: unmoeglich. Und ausgerechnet die neuesten Seiten bekamen so das
  // schwaechste Recrawl-Signal.
  //
  // Der Fix von gestern (max aus gepflegt + veroeffentlicht_am) konnte das nicht
  // heilen: eine Stadt ohne generierten Lokalinhalt hat kein
  // `veroeffentlicht_am`. Dritte Quelle ist die Git-Historie.
  // -------------------------------------------------------------------------
  it('hebt eine Stadt auf ihr Anlagedatum, wenn der gepflegte Eintrag aelter ist', () => {
    // huerth kam mit Welle 9 am 19.08. — der Default sagt 24.05.
    expect(stadtLastModifiedISO('huerth')).toBe('2026-08-19')
  })

  it('gilt auch fuer den Bestand: nichts ist aelter als der 01.06.', () => {
    for (const slug of ['koeln', 'berlin', 'bocholt']) {
      expect(stadtLastModifiedISO(slug) >= '2026-06-01').toBe(true)
    }
  })

  it('das DB-Datum schlaegt das Anlagedatum, wenn es neuer ist', () => {
    expect(stadtLastModifiedISO('huerth', '2026-08-20T04:48:00.000Z')).toBe('2026-08-20')
  })

  it('das Anlagedatum schlaegt ein AELTERES DB-Datum nicht zurueck', () => {
    // Ein Generatorlauf von vorgestern darf eine Seite nicht juenger machen —
    // aber auch nicht aelter als ihre Entstehung.
    expect(stadtLastModifiedISO('huerth', '2026-06-15T00:00:00.000Z')).toBe('2026-08-19')
  })

  it('vertraegt eine Stadt ohne Anlagedatum (Map hinkt hinterher)', () => {
    expect(stadtLastModifiedISO('gibt-es-nicht')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })

  it('kennt JEDE Stadt – sonst hinkt die generierte Map hinterher', () => {
    // Die Map wird von scripts/generate-stadt-anlagedatum.mjs erzeugt, nicht
    // gepflegt. Wer Staedte hinzufuegt und das Skript vergisst, faellt fuer die
    // neuen wieder auf den Default 2026-05-24 zurueck — also genau auf ein
    // Datum vor ihrer Entstehung. Das faellt sonst niemandem auf: die Sitemap
    // sieht vollstaendig aus, nur das Signal ist falsch.
    const ohne = STAEDTE.filter((s) => !(s.slug in STADT_ANLAGEDATUM)).map((s) => s.slug)
    expect(ohne).toEqual([])
  })

  it('kein Anlagedatum liegt vor dem ersten Repo-Commit der Liste', () => {
    // Reissleine gegen eine kaputt generierte Map: alles vor dem 01.06.2026
    // waere ein Ableitungsfehler (z.B. ein Lauf gegen die falsche Historie —
    // auf einem Feature-Branch verschluckt der Squash den echten Tag).
    const zuFrueh = Object.entries(STADT_ANLAGEDATUM).filter(([, tag]) => tag < '2026-06-01')
    expect(zuFrueh).toEqual([])
  })

  it('liefert immer reines YYYY-MM-DD', () => {
    expect(stadtLastModifiedISO('huerth', '2026-08-19T10:38:00.000Z')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(stadtLastModifiedISO('huerth')).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
