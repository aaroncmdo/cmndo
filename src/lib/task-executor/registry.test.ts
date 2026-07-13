// src/lib/task-executor/registry.test.ts
import { describe, it, expect } from 'vitest'
import { executableTypeFor, buildExecutorSystem } from './registry'
import type { TaskRow } from './types'

const base: TaskRow = { id: 't', typ: 'sa_ausstehend', titel: 'SA', beschreibung: null, status: 'offen', claim_id: 'c1', fall_id: 'f1', empfaenger_rolle: null }

describe('executableTypeFor', () => {
  it('matcht erlaubten typ mit claim_id', () => {
    expect(executableTypeFor(base)?.label).toBeTruthy()
  })
  it('null ohne claim_id', () => {
    expect(executableTypeFor({ ...base, claim_id: null })).toBeNull()
  })
  it('null bei erledigt', () => {
    expect(executableTypeFor({ ...base, status: 'erledigt' })).toBeNull()
  })
  it('null bei nicht-executable typ (reliability)', () => {
    expect(executableTypeFor({ ...base, typ: 'reliability' })).toBeNull()
  })
  it('null bei typ=null', () => {
    expect(executableTypeFor({ ...base, typ: null })).toBeNull()
  })
})

describe('buildExecutorSystem', () => {
  it('enthaelt Basis + typ-Hint', () => {
    const s = buildExecutorSystem(base)
    expect(s).toContain('Schaden-Ops')
    expect(s.length).toBeGreaterThan(base.titel.length)
  })
})
