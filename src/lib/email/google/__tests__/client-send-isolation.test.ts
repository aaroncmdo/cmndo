import { describe, it, expect, vi, beforeEach } from 'vitest'

// Send-Client-Ebene isolieren: SMTP-Transport, Resend, email_log + Side-Effect-Gate mocken.
// interne-identitaet (pure Klassifikation) + plain-text bleiben ECHT — das ist die zu
// testende Logik bzw. harmlos.
const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'smtp-real-123' })
vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail: sendMailMock }) },
}))
vi.mock('@/lib/email/resend-client', () => ({
  isResendAvailable: () => false, // -> SMTP-Pfad (nodemailer)
  resend: null,
}))
vi.mock('@/lib/claims/get-claim-for-role', () => ({
  resolveClaimId: vi.fn().mockResolvedValue(null),
}))
// plain-text zieht @react-email/render -> fuer den Send-Isolation-Unittest irrelevant.
vi.mock('@/lib/email/plain-text', () => ({
  htmlToPlainText: (html: string) => html ?? '',
}))
// live + kein suppress -> wir erreichen die Send-Isolation (nicht das SIDE_EFFECT-Gate)
vi.mock('@/lib/side-effects/mode', () => ({
  resolveSideEffectRecipient: () => ({ mode: 'live', suppress: false, recipient: '' }),
}))
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'log1' } }) }) }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}))

beforeEach(() => sendMailMock.mockClear())

describe('sendEmail — Send-Isolation & allowInternalRecipient', () => {
  const INTERN = 'aaron.sprafke+werkstattneu@claimondo.de' // @claimondo.de -> intern klassifiziert

  it('unterdrueckt interne Empfaenger OHNE allowInternalRecipient (Guard bleibt scharf)', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({ to: INTERN, subject: 's', html: '<p>h</p>' })
    expect(res.messageId).toMatch(/internal-recipient-suppressed/)
    expect(sendMailMock).not.toHaveBeenCalled()
  }, 20000)

  it('sendet an internen Empfaenger MIT allowInternalRecipient (admin-getriggerte 1:1-Transaktionsmail)', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({
      to: INTERN,
      subject: 's',
      html: '<p>h</p>',
      allowInternalRecipient: true,
    })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(res.messageId).toBe('smtp-real-123')
  }, 20000)

  it('externe Empfaenger senden immer (Flag irrelevant)', async () => {
    const { sendEmail } = await import('../client')
    await sendEmail({ to: 'kunde@gmail.com', subject: 's', html: '<p>h</p>' })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
  }, 20000)

  it('stellt operative Betriebs-Inbox info@ OHNE Flag zu (Allowlist, kein Matching-Bystander)', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({ to: 'info@claimondo.de', subject: 's', html: '<p>h</p>' })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(res.messageId).toBe('smtp-real-123')
  }, 20000)

  it('stellt die Abnahme-Inbox abnahme+<tag>@claimondo.de OHNE Flag zu (Regel-4-Mail-Nachweis)', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({ to: 'abnahme+e6-kasko-1725000000@claimondo.de', subject: 's', html: '<p>h</p>' })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(res.messageId).toBe('smtp-real-123')
  }, 20000)

  it('haelt eine NICHT-allowlistete Founder-Adresse OHNE Flag weiter suppressed (Guard scharf)', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({ to: 'aaron.sprafke@claimondo.de', subject: 's', html: '<p>h</p>' })
    expect(res.messageId).toMatch(/internal-recipient-suppressed/)
    expect(sendMailMock).not.toHaveBeenCalled()
  }, 20000)
})

// Zweite, unabhaengige Achse: KANN die Adresse ueberhaupt Post empfangen? Diese Frage ist von
// "darf sie angeschrieben werden" getrennt — und ihre Antwort ist NICHT verhandelbar.
describe('sendEmail — unzustellbare Domains (RFC 2606/6762)', () => {
  it('⭐ unterdrueckt .test AUCH MIT allowInternalRecipient — das Flag darf hier nicht wirken', async () => {
    // Der eigentliche Fix: notify-werkstatt-auftrag setzt dieses Flag bewusst, und genau darueber
    // gingen 223 Mails an @claimondo.test raus. Waere der Filter abschaltbar, aendert sich nichts.
    const { sendEmail } = await import('../client')
    const res = await sendEmail({
      to: 'werkstatt@claimondo.test',
      subject: 's',
      html: '<p>h</p>',
      allowInternalRecipient: true,
    })
    expect(res.messageId).toMatch(/unroutable-domain-suppressed/)
    expect(sendMailMock).not.toHaveBeenCalled()
  }, 20000)

  it('unterdrueckt example.com und .invalid ebenso', async () => {
    const { sendEmail } = await import('../client')
    for (const to of ['a@example.com', 'a@partnerbetrieb-km.invalid']) {
      const res = await sendEmail({ to, subject: 's', html: '<p>h</p>', allowInternalRecipient: true })
      expect(res.messageId).toMatch(/unroutable-domain-suppressed/)
    }
    expect(sendMailMock).not.toHaveBeenCalled()
  }, 20000)

  it('laesst den bisherigen Zweck des Flags unangetastet: @claimondo.de geht weiter raus', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({
      to: 'werkstatt@claimondo.de',
      subject: 's',
      html: '<p>h</p>',
      allowInternalRecipient: true,
    })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(res.messageId).toBe('smtp-real-123')
  }, 20000)

  it('sendet an die erreichbaren Empfaenger weiter, wenn nur EINER der Liste unzustellbar ist', async () => {
    const { sendEmail } = await import('../client')
    const res = await sendEmail({
      to: ['a@claimondo.test', 'kunde@gmail.com'],
      subject: 's',
      html: '<p>h</p>',
    })
    expect(sendMailMock).toHaveBeenCalledTimes(1)
    expect(sendMailMock.mock.calls[0][0].to).toBe('kunde@gmail.com')
    expect(res.messageId).toBe('smtp-real-123')
  }, 20000)
})
