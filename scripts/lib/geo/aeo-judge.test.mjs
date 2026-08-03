import { describe, it, expect } from 'vitest'
import { parseScores } from './aeo-judge.mjs'

describe('parseScores', () => {
  it('parst blankes JSON', () => {
    expect(parseScores('{"accuracy":8,"sentiment":5,"completeness":7}')).toEqual({ accuracy: 8, sentiment: 5, completeness: 7 })
  })
  it('parst JSON in ```json-Fences mit Prosa drumrum', () => {
    expect(parseScores('Hier:\n```json\n{"accuracy":10,"sentiment":6,"completeness":4}\n```')).toEqual({ accuracy: 10, sentiment: 6, completeness: 4 })
  })
  it('gibt null bei kaputtem/ausserhalb-0-10 JSON', () => {
    expect(parseScores('kein json')).toBeNull()
    expect(parseScores('{"accuracy":99}')).toBeNull()
  })
})
