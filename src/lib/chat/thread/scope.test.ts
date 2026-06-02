import { describe, it, expect } from 'vitest'
import { buildThreadFilter, buildChannelName, matchesScope, type ChatScope } from './scope'

const fallOne: ChatScope = { kind: 'fall', fallIds: ['f1'], kanaele: ['whatsapp', 'chat_kunde_sv'] }
const fallMany: ChatScope = { kind: 'fall', fallIds: ['f1', 'f2'], kanaele: ['gruppenchat'] }
const allow: ChatScope = { kind: 'kanal-allowlist', kanal: 'chat_kb_kunde', senderAllowlist: ['u1', 'u2'] }

describe('buildThreadFilter', () => {
  it('single-fall: serverFilter on fall_id', () => {
    expect(buildThreadFilter(fallOne)).toEqual({ mode: 'fall', fallIds: ['f1'], kanaele: ['whatsapp', 'chat_kunde_sv'], serverFilter: 'fall_id=eq.f1' })
  })
  it('multi-fall: no serverFilter (client matchesScope filters)', () => {
    expect(buildThreadFilter(fallMany)).toEqual({ mode: 'fall', fallIds: ['f1', 'f2'], kanaele: ['gruppenchat'], serverFilter: null })
  })
  it('kanal-allowlist: serverFilter on kanal', () => {
    expect(buildThreadFilter(allow)).toEqual({ mode: 'kanal', kanal: 'chat_kb_kunde', serverFilter: 'kanal=eq.chat_kb_kunde' })
  })
})

describe('buildChannelName', () => {
  it('fall name includes ids + instanceId', () => {
    expect(buildChannelName(fallMany, 'i9', 'u1')).toBe('chat:fall:f1,f2:i9')
  })
  it('kanal name includes kanal + userId + instanceId', () => {
    expect(buildChannelName(allow, 'i9', 'u1')).toBe('chat:kanal:chat_kb_kunde:u1:i9')
  })
})

describe('matchesScope', () => {
  it('fall: matches fall_id in set AND kanal in set', () => {
    expect(matchesScope({ fall_id: 'f1', kanal: 'whatsapp', sender_id: 'x' }, fallOne)).toBe(true)
    expect(matchesScope({ fall_id: 'f9', kanal: 'whatsapp', sender_id: 'x' }, fallOne)).toBe(false)
    expect(matchesScope({ fall_id: 'f1', kanal: 'gruppenchat', sender_id: 'x' }, fallOne)).toBe(false)
  })
  it('kanal-allowlist: matches kanal AND sender in allowlist', () => {
    expect(matchesScope({ fall_id: null, kanal: 'chat_kb_kunde', sender_id: 'u2' }, allow)).toBe(true)
    expect(matchesScope({ fall_id: null, kanal: 'chat_kb_kunde', sender_id: 'u9' }, allow)).toBe(false)
    expect(matchesScope({ fall_id: null, kanal: 'gruppenchat', sender_id: 'u1' }, allow)).toBe(false)
  })
})
