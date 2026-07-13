// src/lib/offline/ops.test.ts
import { describe, it, expect } from 'vitest'
import { getBackoff, isReadyForRetry, nextStatusAfterFailure, MAX_RETRIES } from './ops'

describe('getBackoff', () => {
  it('ramps and caps at 10min', () => {
    expect(getBackoff(0)).toBe(1000)
    expect(getBackoff(3)).toBe(120000)
    expect(getBackoff(99)).toBe(600000)
  })
})

describe('isReadyForRetry', () => {
  it('pending is always ready', () => {
    expect(isReadyForRetry({ status: 'pending', retry_count: 5, last_attempt_at: 1 }, 1_000_000)).toBe(true)
  })
  it('failed waits for backoff window', () => {
    const op = { status: 'failed' as const, retry_count: 1, last_attempt_at: 1_000_000 }
    expect(isReadyForRetry(op, 1_000_000 + 4000)).toBe(false) // < 5s
    expect(isReadyForRetry(op, 1_000_000 + 6000)).toBe(true)  // >= 5s
  })
})

describe('nextStatusAfterFailure', () => {
  it('becomes dead at MAX_RETRIES', () => {
    expect(nextStatusAfterFailure(0)).toEqual({ status: 'failed', retry_count: 1 })
    expect(nextStatusAfterFailure(MAX_RETRIES - 1)).toEqual({ status: 'dead', retry_count: MAX_RETRIES })
  })
})
