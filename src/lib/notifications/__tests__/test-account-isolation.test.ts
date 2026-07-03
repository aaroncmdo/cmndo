import { describe, it, expect } from 'vitest'
import { stripTestAccountExternalChannels } from '../fan-out'
import type { Recipient } from '../types'

// Send-Isolation (03.07.): Test-SVs (sachverstaendige.ist_testaccount) duerfen NIE externe
// Sends (WhatsApp/Email/Push) bekommen — nur in_app (harmlose Bell). Persistent, unabhaengig
// von SIDE_EFFECT_MODE. Diese pure Funktion ist der Kern; der async-Wrapper in computeRecipients
// laedt die Test-Profile-Ids und ruft sie auf.
describe('stripTestAccountExternalChannels', () => {
  const testId = 'sv-test-1'

  it('strippt externe Kanaele eines Test-SV, behaelt nur in_app', () => {
    const recipients: Recipient[] = [
      { userId: testId, role: 'sachverstaendiger', channels: ['whatsapp', 'web_push', 'email', 'in_app'] },
    ]
    const out = stripTestAccountExternalChannels(recipients, new Set([testId]))
    expect(out).toEqual([{ userId: testId, role: 'sachverstaendiger', channels: ['in_app'] }])
  })

  it('droppt einen Test-SV ganz, wenn er keinen in_app-Kanal hatte (nur externe)', () => {
    const recipients: Recipient[] = [
      { userId: testId, role: 'sachverstaendiger', channels: ['whatsapp', 'web_push'] },
    ]
    expect(stripTestAccountExternalChannels(recipients, new Set([testId]))).toEqual([])
  })

  it('laesst einen ECHTEN SV unangetastet', () => {
    const recipients: Recipient[] = [
      { userId: 'sv-real', role: 'sachverstaendiger', channels: ['whatsapp', 'in_app'] },
    ]
    expect(stripTestAccountExternalChannels(recipients, new Set([testId]))).toEqual(recipients)
  })

  it('greift NUR bei Rolle sachverstaendiger — ein kunde mit derselben id behaelt externe Kanaele', () => {
    const recipients: Recipient[] = [
      { userId: testId, role: 'kunde', channels: ['whatsapp', 'in_app'] },
    ]
    expect(stripTestAccountExternalChannels(recipients, new Set([testId]))).toEqual(recipients)
  })

  it('no-op wenn das Test-Set leer ist', () => {
    const recipients: Recipient[] = [
      { userId: testId, role: 'sachverstaendiger', channels: ['whatsapp', 'in_app'] },
    ]
    expect(stripTestAccountExternalChannels(recipients, new Set<string>())).toEqual(recipients)
  })
})
