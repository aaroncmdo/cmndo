import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// ⚠ `server-only` wirft in der vitest-Node-Umgebung schon BEIM IMPORT — das File waere sonst
// rot, obwohl jeder einzelne Test gruen ist (genau diese Signatur: "1 failed | 9 passed").
vi.mock('server-only', () => ({}))

import { pruefeAnthropicGuthaben, istGuthabenFehler, PROBE_MODELL } from '../anthropic-guthaben'

const ECHTE_MELDUNG =
  'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.'

function antwort(status: number, body: unknown): typeof fetch {
  return (async () =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    }) as Response) as unknown as typeof fetch
}

const alterKey = process.env.ANTHROPIC_API_KEY
beforeEach(() => {
  process.env.ANTHROPIC_API_KEY = 'test-key'
})
afterEach(() => {
  if (alterKey === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = alterKey
})

describe('istGuthabenFehler', () => {
  it('erkennt die echte API-Meldung', () => {
    expect(istGuthabenFehler(ECHTE_MELDUNG)).toBe(true)
  })

  it('ist gross-/kleinschreibungstolerant', () => {
    expect(istGuthabenFehler('CREDIT BALANCE IS TOO LOW')).toBe(true)
  })

  it('verwechselt andere Fehler nicht damit', () => {
    expect(istGuthabenFehler('rate_limit_error: too many requests')).toBe(false)
    expect(istGuthabenFehler('invalid x-api-key')).toBe(false)
  })
})

describe('pruefeAnthropicGuthaben', () => {
  it('meldet ok bei HTTP 200', async () => {
    expect(await pruefeAnthropicGuthaben(antwort(200, { id: 'x' }))).toEqual({ status: 'ok' })
  })

  it('meldet guthaben_leer bei der echten 400-Antwort', async () => {
    const r = await pruefeAnthropicGuthaben(
      antwort(400, { type: 'error', error: { type: 'invalid_request_error', message: ECHTE_MELDUNG } }),
    )
    expect(r.status).toBe('guthaben_leer')
    if (r.status === 'guthaben_leer') expect(r.meldung).toContain('credit balance')
  })

  it('trennt ANDERE 400er sauber ab — sonst meldet ein Tippfehler einen Zahlungsvorgang', async () => {
    const r = await pruefeAnthropicGuthaben(
      antwort(400, { error: { message: 'model: unknown model xyz' } }),
    )
    expect(r.status).toBe('anderer_fehler')
  })

  it('meldet 429 als anderen Fehler, nicht als leeres Guthaben', async () => {
    const r = await pruefeAnthropicGuthaben(antwort(429, { error: { message: 'rate_limit_error' } }))
    expect(r).toMatchObject({ status: 'anderer_fehler', http: 429 })
  })

  it('meldet kein_key, wenn die Variable fehlt', async () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(await pruefeAnthropicGuthaben(antwort(200, {}))).toEqual({ status: 'kein_key' })
  })

  it('wirft NICHT bei einem Netzfehler und meldet ihn als anderen Fehler', async () => {
    const kaputt = (async () => {
      throw new Error('ECONNREFUSED')
    }) as unknown as typeof fetch
    const r = await pruefeAnthropicGuthaben(kaputt)
    // ⚠ Ein DNS-Aussetzer darf keinen Zahlungs-Task erzeugen.
    expect(r).toMatchObject({ status: 'anderer_fehler', http: 0 })
  })

  it('kommt mit einer Nicht-JSON-Fehlerantwort zurecht', async () => {
    const r = await pruefeAnthropicGuthaben(antwort(502, '<html>Bad Gateway</html>'))
    expect(r.status).toBe('anderer_fehler')
  })

  it('nutzt bewusst das kleinste Modell', () => {
    expect(PROBE_MODELL).toContain('haiku')
  })
})
