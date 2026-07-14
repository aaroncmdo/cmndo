import { describe, it, expect, vi, beforeEach } from 'vitest'

const insertedRows: Array<Record<string, unknown>> = []
const smsCalls: Array<{ to: string; body: string }> = []
const insertResult = {
  data: { id: 'invite-1' } as { id: string } | null,
  error: null as { message: string } | null,
}
const smsResult = { value: { success: true, sid: 'SM123' } as { success: boolean; sid?: string; error?: string } }

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: (row: Record<string, unknown>) => {
        insertedRows.push(row)
        return { select: () => ({ single: async () => insertResult }) }
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

beforeEach(() => {
  insertedRows.length = 0
  smsCalls.length = 0
  insertResult.data = { id: 'invite-1' }
  insertResult.error = null
  smsResult.value = { success: true, sid: 'SM123' }
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.claimondo.de'
})

describe('inviteGegnerViaAirdrop', () => {
  it('legt eine Schema-konforme Invite-Zeile an', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(true)
    const row = insertedRows[0]
    expect(row.claim_id).toBe('claim-1')
    // CHECK erlaubt nur qr_code|airdrop|whatsapp|sms|email|manual_link|telegram|signal
    expect(row.invited_via).toBe('sms')
    // CHECK erlaubt kein 'pending'/'accepted'
    expect(row.status).toBe('offen')
    expect(row.token_hash).toMatch(/^[a-f0-9]{64}$/)
    expect(String(row.token_lookup_prefix)).toHaveLength(8)
    // chk_airdrop_expires_after_invite
    expect(new Date(row.expires_at as string).getTime()).toBeGreaterThan(Date.now())
    // Klartext-Token darf NIE in die DB
    expect(row).not.toHaveProperty('token')
  })

  it('schickt die SMS an die normalisierte Nummer, mit Klartext-Token im Link', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(smsCalls).toHaveLength(1)
    expect(smsCalls[0].to).toBe('+491701234567')
    const link = smsCalls[0].body.match(/https:\/\/\S+/)?.[0] ?? ''
    expect(link).toContain('/unfallmeldung/')

    // Der Token im Link muss zum gespeicherten Hash passen:
    const { hashAirdropToken } = await import('../token')
    const token = link.split('/unfallmeldung/')[1]
    expect(hashAirdropToken(token)).toBe(insertedRows[0].token_hash)
  })

  it('ohne Telefonnummer: kein Insert, kein Send, klarer Fehler', async () => {
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '  ')

    expect(res).toEqual({ ok: false, error: 'Keine Telefonnummer' })
    expect(insertedRows).toHaveLength(0)
    expect(smsCalls).toHaveLength(0)
  })

  it('DB-Fehler: kein SMS-Versand (kein Invite ohne Zeile)', async () => {
    insertResult.data = null
    insertResult.error = { message: 'boom' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res.ok).toBe(false)
    expect(smsCalls).toHaveLength(0)
  })

  it('SMS-Fehler: Invite bleibt bestehen, ok:true mit smsSent=false (Cron fasst nach)', async () => {
    smsResult.value = { success: false, error: 'twilio down' }
    const { inviteGegnerViaAirdrop } = await import('../gegner-invite')
    const res = await inviteGegnerViaAirdrop('claim-1', '01701234567')

    expect(res).toMatchObject({ ok: true, smsSent: false })
    expect(insertedRows).toHaveLength(1)
  })
})
