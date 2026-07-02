import { describe, it, expect } from 'vitest'
import { validateForAutoPublish } from './validate'

// Filler text repeated to reach >=800 chars without using required tokens prematurely.
const FILLER =
  'Dieser Artikel behandelt relevante Aspekte des deutschen Schadensrechts fuer Kfz-Sachverstaendige. '

function makeValidBody(extra = ''): string {
  // Build a base that satisfies all four checks, then pad to >=800 chars.
  const required =
    '§ 249 BGB regelt den Umfang des Schadensersatzes. Keine Rechtsberatung — bitte einen Anwalt konsultieren. '
  const base = required + extra
  // Repeat FILLER until total length >= 800
  let body = base
  while (body.length < 800) {
    body += FILLER
  }
  return body
}

describe('validateForAutoPublish', () => {
  it('gibt autopublish:true fuer einen vollstaendig gueltigen Body', () => {
    const body = makeValidBody()
    expect(body.length).toBeGreaterThanOrEqual(800)
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: true })
  })

  it('gibt az_review wenn ein Gerichts-Aktenzeichen vorhanden ist (Reihenfolge: nach Disclaimer)', () => {
    // Body that satisfies laenge, kein_paragraph, kein_disclaimer — but contains an Az.
    const body = makeValidBody('VI ZR 123/22 ist ein bekanntes Urteil. ')
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: false, reason: 'az_review' })
  })

  it('gibt kein_paragraph wenn kein §-Zeichen vorhanden ist', () => {
    // Build a body >=800 chars with disclaimer but no § reference.
    const noParaBase =
      'Keine Rechtsberatung — bitte einen Anwalt konsultieren. ' +
      'Dieser Artikel behandelt das Schadensrecht ohne Paragraphen-Verweis. '
    let body = noParaBase
    while (body.length < 800) {
      body += FILLER
    }
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: false, reason: 'kein_paragraph' })
  })

  it('gibt kein_disclaimer wenn der Disclaimer fehlt', () => {
    // Build a body >=800 chars with § but no disclaimer.
    const noDiscBase = '§ 249 BGB regelt den Schadensersatz. '
    let body = noDiscBase
    while (body.length < 800) {
      body += FILLER
    }
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: false, reason: 'kein_disclaimer' })
  })

  it('gibt laenge wenn der Body nur 200 Zeichen lang ist', () => {
    const short = '§ 249 BGB. Keine Rechtsberatung. '.padEnd(200, 'x')
    expect(short.length).toBe(200)
    const result = validateForAutoPublish({ body: short })
    expect(result).toEqual({ autopublish: false, reason: 'laenge' })
  })

  it('prueft Reihenfolge: laenge wird vor kein_paragraph gemeldet', () => {
    // Short body that also lacks §
    const result = validateForAutoPublish({ body: 'Keine Rechtsberatung.' })
    expect(result.reason).toBe('laenge')
  })

  it('prueft Reihenfolge: kein_paragraph wird vor kein_disclaimer gemeldet', () => {
    // >=800 chars, no §, no disclaimer
    let body = 'Dieser Text hat keinen Paragraphen-Verweis und keinen Disclaimer. '
    while (body.length < 800) {
      body += FILLER
    }
    const result = validateForAutoPublish({ body })
    expect(result.reason).toBe('kein_paragraph')
  })

  it('prueft Reihenfolge: kein_disclaimer wird vor az_review gemeldet', () => {
    // >=800 chars, has §, no disclaimer, has Az
    const base = '§ 249 BGB gilt hier. VI ZR 123/22. '
    let body = base
    while (body.length < 800) {
      body += FILLER
    }
    const result = validateForAutoPublish({ body })
    expect(result.reason).toBe('kein_disclaimer')
  })

  it('akzeptiert einen Body mit genau 800 Zeichen', () => {
    // Pad a valid body to exactly 800 chars.
    const base =
      '§ 249 BGB regelt den Schadensersatz. Keine Rechtsberatung bitte. '
    let body = base
    while (body.length < 800) {
      body += 'x'
    }
    body = body.slice(0, 800)
    expect(body.length).toBe(800)
    // Verify § and disclaimer still present after slicing
    // The base is short (66 chars), so the slice keeps it intact.
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: true })
  })

  it('lehnt einen Body mit 15001 Zeichen ab (zu lang)', () => {
    const body = makeValidBody().padEnd(15001, 'y')
    const result = validateForAutoPublish({ body })
    expect(result).toEqual({ autopublish: false, reason: 'laenge' })
  })

  it('Az-Regex erkennt verschiedene Az-Muster (II ZR, IV StR)', () => {
    const body = makeValidBody('II ZR 45/19 wurde zitiert. ')
    expect(validateForAutoPublish({ body })).toEqual({
      autopublish: false,
      reason: 'az_review',
    })

    const body2 = makeValidBody('IV StR 12/20 ist relevant. ')
    expect(validateForAutoPublish({ body: body2 })).toEqual({
      autopublish: false,
      reason: 'az_review',
    })
  })
})
