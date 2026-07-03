// SP2 Task 5 — Tests fuer Kunden-Benachrichtigung bei Reparaturtermin-Status-Wechsel.
// HTML-Builder rein (kein Netzwerk). notifyKundeReparaturtermin injiziert Mock-Sender
// + Mock-Supabase-Client (kein echtes DB).

import { describe, it, expect, vi } from 'vitest'
import {
  buildKundeReparaturterminEmailHtml,
  notifyKundeReparaturtermin,
  type NotifyKundeReparaturterminDeps,
} from '../notify-kunde-reparaturtermin'

// ─── buildKundeReparaturterminEmailHtml ──────────────────────────────────────

describe('buildKundeReparaturterminEmailHtml', () => {
  it('bestaetigt — enthaelt Betreff + Termin-Zeile (wenn vorhanden)', () => {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname: 'Lisa',
      ereignis: 'bestaetigt',
      bestaetigterTermin: '2026-07-15T10:00:00Z',
    })
    expect(betreff).toContain('bestätigt')
    expect(html).toContain('Hallo Lisa,')
    expect(html).toContain('bestätigt')
    // Formatierter Termin sollte enthalten sein
    expect(html).toMatch(/15\.07\.2026/)
  })

  it('bestaetigt ohne Termin — keine leere Termin-Zeile', () => {
    const { html } = buildKundeReparaturterminEmailHtml({
      vorname: null,
      ereignis: 'bestaetigt',
      bestaetigterTermin: null,
    })
    expect(html).toContain('Hallo,')
    expect(html).not.toContain('Ihr bestätigter Reparaturtermin:')
    expect(html).toContain('bestätigt')
  })

  it('anruf_erbeten — enthaelt passenden Inhalt', () => {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname: 'Max',
      ereignis: 'anruf_erbeten',
    })
    expect(betreff).toContain('meldet sich')
    expect(html).toContain('Hallo Max,')
    expect(html).toContain('telefonisch')
  })

  it('abgelehnt — enthaelt Absage-Inhalt', () => {
    const { html, betreff } = buildKundeReparaturterminEmailHtml({
      vorname: 'Anna',
      ereignis: 'abgelehnt',
    })
    expect(betreff).toContain('konnte nicht bestätigt werden')
    expect(html).toContain('leider konnte die Werkstatt')
  })

  it('escaped XSS in vorname', () => {
    const { html } = buildKundeReparaturterminEmailHtml({
      vorname: '<script>alert(1)</script>',
      ereignis: 'bestaetigt',
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})

// ─── notifyKundeReparaturtermin ──────────────────────────────────────────────

function makeSupaMock(overrides: {
  claim?: Record<string, unknown> | null
  profil?: Record<string, unknown> | null
  lead?: Record<string, unknown> | null
}) {
  function maybeSingle(data: Record<string, unknown> | null) {
    return { data, error: null }
  }

  const svc = {
    from: vi.fn((table: string) => {
      if (table === 'claims') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(maybeSingle(overrides.claim ?? null)),
            }),
          }),
        }
      }
      if (table === 'profiles') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(maybeSingle(overrides.profil ?? null)),
            }),
          }),
        }
      }
      if (table === 'leads') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue(maybeSingle(overrides.lead ?? null)),
            }),
          }),
        }
      }
      return { select: vi.fn() }
    }),
  }
  return svc as unknown as import('@supabase/supabase-js').SupabaseClient
}

function makeDeps(over?: Partial<NotifyKundeReparaturterminDeps>) {
  const mail = vi.fn().mockResolvedValue({ messageId: 'm' })
  return {
    d: { sendEmail: over?.sendEmail ?? mail } as NotifyKundeReparaturterminDeps,
    mail,
  }
}

describe('notifyKundeReparaturtermin', () => {
  it('sendet Email ueber Profil-Email wenn Kunde vorhanden', async () => {
    const svc = makeSupaMock({
      claim: { geschaedigter_user_id: 'uid-1', lead_id: null },
      profil: { vorname: 'Lisa', email: 'lisa@example.com' },
    })
    const { d, mail } = makeDeps()
    const r = await notifyKundeReparaturtermin(
      { claimId: 'c-1', ereignis: 'bestaetigt', bestaetigterTermin: null, svc },
      d,
    )
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0].to).toBe('lisa@example.com')
    expect(mail.mock.calls[0][0].template).toBe('reparaturtermin_bestaetigt')
    expect(r).toEqual({ email: true })
  })

  it('faellt auf Lead-Email zurueck wenn kein Profil', async () => {
    const svc = makeSupaMock({
      claim: { geschaedigter_user_id: null, lead_id: 'l-1' },
      lead: { vorname: 'Max', email: 'max@example.com' },
    })
    const { d, mail } = makeDeps()
    const r = await notifyKundeReparaturtermin(
      { claimId: 'c-1', ereignis: 'anruf_erbeten', bestaetigterTermin: null, svc },
      d,
    )
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0].to).toBe('max@example.com')
    expect(mail.mock.calls[0][0].template).toBe('reparaturtermin_anruf_erbeten')
    expect(r).toEqual({ email: true })
  })

  it('gibt {email:false} zurueck wenn kein Claim gefunden', async () => {
    const svc = makeSupaMock({ claim: null })
    const { d, mail } = makeDeps()
    const r = await notifyKundeReparaturtermin(
      { claimId: 'c-1', ereignis: 'abgelehnt', bestaetigterTermin: null, svc },
      d,
    )
    expect(mail).not.toHaveBeenCalled()
    expect(r).toEqual({ email: false })
  })

  it('gibt {email:false} zurueck wenn keine Email-Adresse', async () => {
    const svc = makeSupaMock({
      claim: { geschaedigter_user_id: 'uid-1', lead_id: null },
      profil: { vorname: 'Anna', email: null },
    })
    const { d, mail } = makeDeps()
    const r = await notifyKundeReparaturtermin(
      { claimId: 'c-1', ereignis: 'bestaetigt', bestaetigterTermin: null, svc },
      d,
    )
    expect(mail).not.toHaveBeenCalled()
    expect(r).toEqual({ email: false })
  })

  it('ist non-fatal bei Email-Fehler', async () => {
    const svc = makeSupaMock({
      claim: { geschaedigter_user_id: 'uid-1', lead_id: null },
      profil: { vorname: 'Lisa', email: 'lisa@example.com' },
    })
    const mail = vi.fn().mockRejectedValue(new Error('SMTP down'))
    const d = { sendEmail: mail as unknown as NotifyKundeReparaturterminDeps['sendEmail'] }
    const r = await notifyKundeReparaturtermin(
      { claimId: 'c-1', ereignis: 'bestaetigt', bestaetigterTermin: null, svc },
      d,
    )
    expect(r).toEqual({ email: false })
  })
})
