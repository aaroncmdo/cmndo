import { describe, it, expect } from 'vitest'
import {
  buildProposeSystemPrompt,
  buildProposeUserMessage,
  normalizeKeyword,
  parseProposedTopics,
  dedupeTopics,
  type ProposedTopic,
} from './propose'

const topic = (kw: string): ProposedTopic => ({
  titel: `Titel ${kw}`,
  kurzbrief: 'Fach-Angle mit zwei Sätzen zur Faktengrundlage. Mehr Kontext.',
  primary_keyword: kw,
  cluster: 'Schadenregulierung',
})

describe('buildProposeSystemPrompt', () => {
  it('nennt die Domäne und schließt Off-Topic aus', () => {
    const p = buildProposeSystemPrompt()
    expect(p).toMatch(/Schadenregulierung|Schadengutachten/)
    expect(p).toMatch(/Motorsport/)
    expect(p).toMatch(/JSON/)
  })
})

describe('buildProposeUserMessage', () => {
  it('bittet um count Themen und listet Abgedecktes zum Ausweichen', () => {
    const m = buildProposeUserMessage(3, { titles: ['Nutzungsausfall'], keywords: ['wertminderung'] })
    expect(m).toMatch(/3/)
    expect(m).toMatch(/Nutzungsausfall/)
    expect(m).toMatch(/wertminderung/)
  })
})

describe('normalizeKeyword', () => {
  it('trimmt + lowercased', () => {
    expect(normalizeKeyword('  Wertminderung ')).toBe('wertminderung')
  })
})

describe('parseProposedTopics', () => {
  it('parst ein sauberes JSON-Array', () => {
    const raw = JSON.stringify([topic('a'), topic('b')])
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toHaveLength(2)
  })
  it('toleriert Code-Fences und Einleitungstext', () => {
    const raw = 'Hier die Themen:\n```json\n' + JSON.stringify([topic('a')]) + '\n```'
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data[0].primary_keyword).toBe('a')
  })
  it('filtert Items ohne Pflichtfelder heraus', () => {
    const raw = JSON.stringify([topic('a'), { titel: 'x' }])
    const r = parseProposedTopics(raw)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.data).toHaveLength(1)
  })
  it('Fehler wenn kein Array gefunden', () => {
    expect(parseProposedTopics('kein json hier').ok).toBe(false)
  })
})

describe('dedupeTopics', () => {
  it('droppt Kollisionen (case-insensitive) und interne Duplikate', () => {
    const out = dedupeTopics([topic('Wertminderung'), topic('neu'), topic('neu')], ['wertminderung'])
    expect(out.map((t) => t.primary_keyword)).toEqual(['neu'])
  })
  it('droppt leere Keywords', () => {
    expect(dedupeTopics([{ ...topic(''), primary_keyword: '' }], [])).toHaveLength(0)
  })
})
