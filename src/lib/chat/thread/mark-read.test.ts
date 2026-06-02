import { describe, it, expect } from 'vitest'
import { buildMarkReadSpec } from './mark-read'
import type { ChatScope } from './scope'

describe('buildMarkReadSpec', () => {
  it('fall: keyed on fall_id+kanal, excludes own messages', () => {
    const scope: ChatScope = { kind: 'fall', fallIds: ['f1', 'f2'], kanaele: ['whatsapp'] }
    expect(buildMarkReadSpec(scope, 'me')).toEqual({ mode: 'fall', fallIds: ['f1', 'f2'], kanaele: ['whatsapp'], excludeSenderId: 'me' })
  })
  it('kanal-allowlist: keyed on kanal + empfaenger_id=me (KundeKbChat semantics)', () => {
    const scope: ChatScope = { kind: 'kanal-allowlist', kanal: 'chat_kb_kunde', senderAllowlist: ['a', 'b'] }
    expect(buildMarkReadSpec(scope, 'me')).toEqual({ mode: 'kanal-empfaenger', kanal: 'chat_kb_kunde', empfaengerId: 'me' })
  })
})
