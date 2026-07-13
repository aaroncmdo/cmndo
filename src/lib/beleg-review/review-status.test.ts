// Unit tests for the Beleg-OCR review lifecycle helpers.
// Regression guard for the bug found by check:flag-drift: approveBeleg/
// rejectBeleg wrote ocr_status='approved'/'rejected', but the CHECK
// constraint fall_dokumente_ocr_status_check only permits
// pending/processing/done/failed/skipped -> every write was rejected.
// The review status belongs in ocr_extracted_data._review, decoupled from
// the OCR-pipeline column ocr_status.

import { describe, it, expect } from 'vitest'
import {
  belegReviewStatus,
  istOffenZumReview,
  buildApproveUpdate,
  buildRejectUpdate,
} from './review-status'

describe('belegReviewStatus', () => {
  it('liest approved aus _review.status', () => {
    expect(belegReviewStatus({ _review: { status: 'approved' } })).toBe('approved')
  })

  it('liest rejected aus _review.status', () => {
    expect(belegReviewStatus({ _review: { status: 'rejected' } })).toBe('rejected')
  })

  it('ist null wenn kein _review vorhanden ist', () => {
    expect(belegReviewStatus({ rechnungsnummer: 'R-1' })).toBeNull()
  })

  it('ist null bei null/undefined-Extrakt', () => {
    expect(belegReviewStatus(null)).toBeNull()
    expect(belegReviewStatus(undefined)).toBeNull()
  })

  it('ist null bei nicht-terminalem _review.status (z.B. Legacy pending_review)', () => {
    expect(belegReviewStatus({ _review: { status: 'pending_review' } })).toBeNull()
  })
})

describe('istOffenZumReview', () => {
  it('ein frisch extrahierter Beleg ohne _review ist offen', () => {
    expect(istOffenZumReview({ rechnungsbetrag_brutto: 100 })).toBe(true)
  })

  it('ein null-Extrakt gilt als offen (Original prüfen)', () => {
    expect(istOffenZumReview(null)).toBe(true)
  })

  it('ein freigegebener Beleg ist NICHT mehr offen', () => {
    expect(istOffenZumReview({ _review: { status: 'approved' } })).toBe(false)
  })

  it('ein abgelehnter Beleg ist NICHT mehr offen', () => {
    expect(istOffenZumReview({ _review: { status: 'rejected' } })).toBe(false)
  })
})

describe('buildApproveUpdate', () => {
  const existing = { typ: 'mietwagen_rechnung', rechnungsnummer: 'R-1', rechnungsbetrag_brutto: 100 }

  it('schreibt KEIN ocr_status-Feld (verletzt sonst den CHECK)', () => {
    const update = buildApproveUpdate(existing, undefined, 'user-1', '2026-07-13T10:00:00.000Z')
    expect('ocr_status' in update).toBe(false)
  })

  it('setzt _review.status=approved mit Reviewer + Zeitstempel', () => {
    const update = buildApproveUpdate(existing, undefined, 'user-1', '2026-07-13T10:00:00.000Z')
    expect(update.ocr_extracted_data._review).toEqual({
      status: 'approved',
      reviewed_by: 'user-1',
      reviewed_at: '2026-07-13T10:00:00.000Z',
    })
  })

  it('behält bestehende Extrakt-Felder und überschreibt mit Korrekturen', () => {
    const update = buildApproveUpdate(
      existing,
      { rechnungsbetrag_brutto: 250 },
      'user-1',
      '2026-07-13T10:00:00.000Z',
    )
    expect(update.ocr_extracted_data.typ).toBe('mietwagen_rechnung')
    expect(update.ocr_extracted_data.rechnungsnummer).toBe('R-1')
    expect(update.ocr_extracted_data.rechnungsbetrag_brutto).toBe(250)
  })

  it('funktioniert bei null-Extrakt', () => {
    const update = buildApproveUpdate(null, undefined, 'user-1', '2026-07-13T10:00:00.000Z')
    expect(belegReviewStatus(update.ocr_extracted_data)).toBe('approved')
  })
})

describe('buildRejectUpdate', () => {
  const existing = { typ: 'attest', rechnungsnummer: 'R-9' }

  it('schreibt KEIN ocr_status-Feld (verletzt sonst den CHECK)', () => {
    const update = buildRejectUpdate(existing, 'user-2', '2026-07-13T11:00:00.000Z', 'Bild unscharf')
    expect('ocr_status' in update).toBe(false)
  })

  it('setzt _review.status=rejected mit Grund', () => {
    const update = buildRejectUpdate(existing, 'user-2', '2026-07-13T11:00:00.000Z', 'Bild unscharf')
    expect(update.ocr_extracted_data._review).toEqual({
      status: 'rejected',
      reviewed_by: 'user-2',
      reviewed_at: '2026-07-13T11:00:00.000Z',
      grund: 'Bild unscharf',
    })
  })

  it('behält bestehende Extrakt-Felder', () => {
    const update = buildRejectUpdate(existing, 'user-2', '2026-07-13T11:00:00.000Z', 'Bild unscharf')
    expect(update.ocr_extracted_data.typ).toBe('attest')
    expect(update.ocr_extracted_data.rechnungsnummer).toBe('R-9')
  })
})
