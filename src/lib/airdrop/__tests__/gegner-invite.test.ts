import { describe, it, expect, vi, beforeEach } from 'vitest'

// T3 (operativer-schaden-flow): inviteGegnerViaAirdrop hebt den Gegner-Versand auf die
// WA-first -> SMS -> Email-Kaskade. invited_via startet provisorisch als 'airdrop' und
// wird nach erfolgreichem Versand auf den tatsaechlichen Kanal gehoben.

const insertedRows: Array<Record<string, unknown>> = []
const updatedRows: Array<Record<string, unknown>> = []
const waLookupCalls: string[] = []
const waSendCalls: Array<{ phone: string; text: string }> = []
const smsCalls: Array<{ to: string; body: string }> = []
const emailCalls: Array<{ email: string; link: string; name?: string | null }> = []

const insertResult = {
  data: { id: 'invite-1' } as { id: string } | null,
  error: null as { message: string } | null,
}
const waLookup = { value: { ok: true, onWhatsApp: true } as { ok: boolean; onWhatsApp?: boolean } }
const waSend = { value: { ok: true } as { ok: boolean; error?: string } }
const smsResult = { value: { success: true, sid: 'SM1' } as { success: boolean; sid?: string; error?: string } }
const emailResult = { value: { success: true } as { success: boolean; error?: string } }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return { select: () => ({ single: async () => insertResult }) }
      },
      update: (row: Record<string, unknown>) => {
        updatedRows.push(row)
        return { eq: async () => ({ error: null }) }
      },
    }),
  }),
}))

vi.mock('@/lib/whatsapp/send-sms-plain', () => ({
  normalizeE164: (t: string) => (t.startsWith('0') ? '+49' + t.slice(1) : t),
  sendPlainSms: async (to: string, body: string) => {
    smsCalls.push({ to, body })
    return smsResult.value
  },
}))

vi.mock('@/lib/whatsapp/baileys-client', () => ({
  isOnWhatsApp: async (phone: string) => {
    waLookupCalls.push(phone)
    return waLookup.value
  },
  sendWhatsAppText: async (phone: string, text: string) => {
    waSendCalls.push({ phone, text })
    return waSend.value
  },
}))

vi.mock('@/lib/email/google/flows', () => ({
  sendGegnerBestaetigungLink: async (p: { email: string; link: string; name?: string | null }) => {
    emailCalls.push(p)
    return emailResult.value
  },
}))

beforeEach(() => {
  insertedRows.length = 0
  updatedRows.length = 0
  waLookupCalls.length = 0
  waSendCalls.length = 0
  smsCalls.length = 0
  emailCalls.length = 0
  insertResult.data = { id: 'invite-1' }
  insertResult.error = null
  waLookup.value = { ok: true, onWhatsApp: true }
  waSend.value = { ok: true }
  smsResult.value = { success: true, sid: 'SM1' }
  emailResult.value = { success: true }
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'
})

describe('inviteGegnerViaAirdrop — WA-first Kaskade', () => {
  it('legt eine Schema-konforme Invite-Zeile an (invited_via provisorisch "airdrop")', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(true)
    const row = insertedRows[0]
    expect(row.claim_id).toBe('claim-1')
    // CHECK erlaubt qr_code|airdrop|whatsapp|sms|email|manual_link|telegram|signal
    expect(row.invited_via).toBe('airdrop')
    expect(row.status).toBe('offen')
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(String(row.token_lookup_prefix)).toHaveLength(8)
    // chk_airdrop_expires_after_invite
    expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now())
    // Klartext-Token darf NIE in die DB
    expect(row).not.toHaveProperty('token')
  })

  it('WA verfuegbar -> WhatsApp, kein SMS, invited_via -> whatsapp; Link+Token im Body', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, kanal: 'whatsapp', sent: true })
    expect(waSendCalls).toHaveLength(1)
    expect(waSendCalls[0].phone).toBe('+491701234567')
    expect(smsCalls).toHaveLength(0)
    expect(updatedRows[0]).toEqual({ invited_via: 'whatsapp' })

    const link = waSendCalls[0].text.match(/https:\/\/\S+/)?.[0] ?? ''
    expect(link).toContain('/unfallmeldung/')
    const { hashAirdropToken } = await import('../token')
    const token = link.split('/unfallmeldung/')[1]
    expect(hashAirdropToken(token)).toBe(insertedRows[0].token_hash)
  })

  it('WA nicht verfuegbar -> SMS-Fallback, invited_via -> sms', async () => {
    waLookup.value = { ok: true, onWhatsApp: false }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, kanal: 'sms', sent: true })
    expect(waSendCalls).toHaveLength(0)
    expect(smsCalls).toHaveLength(1)
    expect(smsCalls[0].to).toBe('+491701234567')
    expect(updatedRows[0]).toEqual({ invited_via: 'sms' })
  })

  it('WA-Send-Fehler -> SMS-Fallback', async () => {
    waSend.value = { ok: false, error: 'recipient_not_on_whatsapp' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, kanal: 'sms' })
    expect(smsCalls).toHaveLength(1)
  })

  it('WA+SMS fehlgeschlagen, Email vorhanden -> Email-Fallback', async () => {
    waLookup.value = { ok: true, onWhatsApp: false }
    smsResult.value = { success: false, error: 'twilio down' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567', {
      email: 'gegner@example.com',
      name: 'Max',
    })

    expect(res).toMatchObject({ ok: true, kanal: 'email', sent: true })
    expect(emailCalls).toHaveLength(1)
    expect(emailCalls[0].email).toBe('gegner@example.com')
    expect(emailCalls[0].link).toContain('/unfallmeldung/')
    expect(updatedRows[0]).toEqual({ invited_via: 'email' })
  })

  it('alle Kanaele fehlgeschlagen -> kanal none, sent false, invited_via bleibt airdrop', async () => {
    waLookup.value = { ok: true, onWhatsApp: false }
    smsResult.value = { success: false, error: 'twilio down' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, kanal: 'none', sent: false })
    expect(insertedRows).toHaveLength(1)
    // kein invited_via-Update bei 'none'
    expect(updatedRows).toHaveLength(0)
  })

  it('ohne Telefonnummer: kein Insert, kein Send, klarer Fehler', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '  ')

    expect(res).toEqual({ ok: false, error: 'Keine Telefonnummer' })
    expect(insertedRows).toHaveLength(0)
    expect(waSendCalls).toHaveLength(0)
    expect(smsCalls).toHaveLength(0)
  })

  it('DB-Fehler: kein Versand (kein Invite ohne Zeile)', async () => {
    insertResult.data = null
    insertResult.error = { message: 'boom' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(false)
    expect(waSendCalls).toHaveLength(0)
    expect(smsCalls).toHaveLength(0)
    expect(emailCalls).toHaveLength(0)
  })
})
