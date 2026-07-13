import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Source-guard: kanzlei dunning recomputes blocker LIVE every Stufe (FG7 Task 6 Change A).
// Before the fix, detectBlocker() was only called at Stufe 1 and the result frozen;
// Stufe 2/3 read a stale snapshot from the DB. After the fix, every Stufe calls
// detectBlocker() unconditionally.
describe('kanzlei-mahnungen.ts — blocker live recompute every Stufe (source-guard)', () => {
  const mSrc = readFileSync('src/lib/sla/kanzlei-mahnungen.ts', 'utf8')

  it('recomputes blocker unconditionally: uses "const blocker = await detectBlocker"', () => {
    // The const-assignment form guards against a let+conditional pattern.
    expect(mSrc).toContain('const blocker = await detectBlocker')
  })

  it('the Stufe-1-only snapshot cast is GONE (no "as BlockerInfo[\'rolle\']" indexed-access cast)', () => {
    // This cast only existed inside the removed else-branch that reused the stale snapshot.
    // BlockerInfo the bare type is still imported/used, so the type itself is not gone.
    expect(mSrc).not.toContain("as BlockerInfo['rolle']")
  })

  it('still imports BlockerInfo (used in return type annotation)', () => {
    expect(mSrc).toContain('BlockerInfo')
  })

  it('still calls detectBlocker (live recompute)', () => {
    expect(mSrc).toContain('detectBlocker')
  })

  it('still persists blocker to sla_tracking after every recompute', () => {
    expect(mSrc).toContain("from('sla_tracking')")
    expect(mSrc).toContain('blocker_rolle')
    expect(mSrc).toContain('blocker_grund')
  })

  it('n_mahnungen counter write is untouched (idempotency facts)', () => {
    expect(mSrc).toContain('n_mahnungen')
    expect(mSrc).toContain('letzte_mahnung_am')
  })
})

// Source-guard: completeKanzleiSla uses the valid task-cancel resolver (FG7 Task 6 Change B).
// Before the fix, .update({ status: 'abgebrochen' }) was used — 'abgebrochen' is NOT a
// valid task_status enum member, so Postgres rejected the UPDATE and the cancel never ran.
// After the fix: resolveSlaBreachTaskCancel() provides { status: 'erledigt', auto_resolved_* }.
describe('kanzlei-tracker.ts — completeKanzleiSla valid task-cancel (source-guard)', () => {
  const ktSrc = readFileSync('src/lib/sla/kanzlei-tracker.ts', 'utf8')

  it('does NOT use the invalid enum literal "abgebrochen"', () => {
    expect(ktSrc).not.toContain("'abgebrochen'")
  })

  it('uses the valid auto-resolve resolver resolveSlaBreachTaskCancel', () => {
    expect(ktSrc).toContain('resolveSlaBreachTaskCancel')
  })

  it('imports resolveSlaBreachTaskCancel from ./task-resolution', () => {
    expect(ktSrc).toContain("from './task-resolution'")
  })

  it('the task cancel still filters by fall_id', () => {
    expect(ktSrc).toContain("eq('fall_id'")
  })

  it('the task cancel still filters by status (offen/in-bearbeitung/blockiert)', () => {
    // The .in('status',...) filter that gates only pending tasks must remain
    expect(ktSrc).toContain("in('status'")
    expect(ktSrc).toContain("'offen'")
  })

  it('the task cancel still filters by typ (kanzlei-nachfassen etc.)', () => {
    expect(ktSrc).toContain('kanzlei-nachfassen')
  })
})
