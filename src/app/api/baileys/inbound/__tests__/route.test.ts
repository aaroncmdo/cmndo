import { describe, it, expect, vi, beforeEach } from 'vitest'

// Prueft die Erstkontakt-Verzweigung der Inbound-Route:
//   Bestandsfall -> kein neuer Lead
//   Partner      -> kein neuer Lead, aber Team-Benachrichtigung
//   Unbekannt    -> genau ein Lead, und dessen id landet auf der nachrichten-Zeile
//
// createCase MUSS gemockt werden — der echte Import zieht 'server-only' und
// wuerde in der vitest-Node-Umgebung schon beim Laden werfen (AGENTS.md
// §intake-funnel-gate).

// Die Route vergleicht `authHeader !== \`Bearer ${process.env.CRON_SECRET}\`.
// Ohne gesetztes Secret interpoliert das zu "Bearer undefined" — der Test
// bekaeme 401 und pruefte nie die eigentliche Verzweigung.
process.env.CRON_SECRET = 'test-secret-fuer-route-test'

const state = {
  match: { fallId: null as string | null, leadId: null as string | null, multipleCandidates: false, candidates: [] },
  istPartner: false,
  partnerBezeichnung: null as string | null,
  createCaseOk: true,
  insertError: null as { message: string } | null,
  /** Anzahl inbound-WA-Nachrichten dieser Nummer NACH dem Insert. 1 = Erstkontakt. */
  nachrichtenCount: 1 as number,
  countError: null as { message: string } | null,
}

const inserts: Array<Record<string, unknown>> = []
const createCaseCalls: Array<Record<string, unknown>> = []
const waTexte: string[] = []

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => {
      const b: Record<string, unknown> = {}
      b.select = () => b
      b.eq = () => b
      b.maybeSingle = async () => ({ data: null, error: null })
      b.insert = async (row: Record<string, unknown>) => {
        inserts.push(row)
        return { error: state.insertError }
      }
      // Die Erstkontakt-Zaehlung endet ohne .maybeSingle()/.insert() — die Kette
      // selbst wird awaited. Deshalb ist der Builder thenable.
      b.then = (resolve: (v: unknown) => void) =>
        resolve({ count: state.nachrichtenCount, error: state.countError })
      return b
    },
  }),
}))

vi.mock('@/lib/inbound/match-fall', () => ({
  matchInboundToFall: async () => state.match,
}))

vi.mock('@/lib/inbound/ist-partner-nummer', () => ({
  istPartnerNummer: async () => ({
    istPartner: state.istPartner,
    quelle: state.istPartner ? 'profil' : null,
    bezeichnung: state.partnerBezeichnung,
  }),
}))

vi.mock('@/lib/intake/create-case', () => ({
  createCase: async (_db: unknown, input: Record<string, unknown>) => {
    createCaseCalls.push(input)
    return state.createCaseOk
      ? { ok: true, leadId: 'lead-neu', claimId: null, flowLinkToken: 't', deduped: false }
      : { ok: false, error: 'kaputt' }
  },
}))

vi.mock('@/lib/whatsapp/team-notify', () => ({
  notifyTeamWhatsApp: async (text: string) => {
    waTexte.push(text)
  },
}))

vi.mock('@/lib/inbound/process-inbound-text', () => ({ processInboundText: async () => {} }))
vi.mock('@/lib/inbound/process-inbound-media', () => ({ processInboundMedia: async () => {} }))
vi.mock('@/lib/claims/get-claim-for-role', () => ({ resolveClaimId: async () => null }))

const { POST } = await import('../route')

function anfrage(body: Record<string, unknown>): Request {
  return new Request('http://localhost/api/baileys/inbound', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.CRON_SECRET ?? ''}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  inserts.length = 0
  createCaseCalls.length = 0
  waTexte.length = 0
  state.match = { fallId: null, leadId: null, multipleCandidates: false, candidates: [] }
  state.istPartner = false
  state.partnerBezeichnung = null
  state.createCaseOk = true
  state.insertError = null
  state.nachrichtenCount = 1
  state.countError = null
})

describe('baileys/inbound — Erstkontakt-Verzweigung', () => {
  it('Bestandsfall: legt KEINEN neuen Lead an', async () => {
    state.match = { fallId: 'fall-1', leadId: null, multipleCandidates: false, candidates: [] }
    await POST(anfrage({ phone: '491701234567', text: 'Hallo' }))
    expect(createCaseCalls).toHaveLength(0)
  })

  it('bekannter Lead: legt KEINEN zweiten an (Dedup ueber matchInboundToFall)', async () => {
    state.match = { fallId: null, leadId: 'lead-alt', multipleCandidates: false, candidates: [] }
    await POST(anfrage({ phone: '491701234567', text: 'nochmal' }))
    expect(createCaseCalls).toHaveLength(0)
    expect(inserts[0]?.lead_id).toBe('lead-alt')
  })

  it('Partner: KEIN Lead, aber Team-Benachrichtigung mit Bezeichnung', async () => {
    state.istPartner = true
    state.partnerBezeichnung = 'sachverstaendiger Gaith Hamed'
    await POST(anfrage({ phone: '491735633541', text: 'Kurze Frage' }))
    expect(createCaseCalls).toHaveLength(0)
    expect(waTexte).toHaveLength(1)
    expect(waTexte[0]).toContain('Gaith Hamed')
  })

  it('Unbekannter: genau EIN Lead, lead_id landet auf der Nachricht', async () => {
    await POST(anfrage({ phone: '491701234567', text: 'Ich hatte einen Unfall' }))
    expect(createCaseCalls).toHaveLength(1)
    expect(createCaseCalls[0].mode).toBe('lead-first')
    expect((createCaseCalls[0].base as Record<string, unknown>).source_channel).toBe('whatsapp-inbound')
    expect(inserts[0]?.lead_id).toBe('lead-neu')
    expect(waTexte[0]).toContain('neuer Interessent')
    expect(waTexte[0]).toContain('/dispatch/leads/lead-neu')
  })

  it('createCase schlaegt fehl: Nachricht wird trotzdem gespeichert', async () => {
    state.createCaseOk = false
    const res = await POST(anfrage({ phone: '491701234567', text: 'Hallo' }))
    expect(res.status).toBe(200)
    expect(inserts).toHaveLength(1)
    expect(inserts[0]?.lead_id).toBeNull()
  })

  it('Insert schlaegt fehl: KEINE Benachrichtigung ueber eine ungespeicherte Nachricht', async () => {
    state.insertError = { message: 'db weg' }
    const res = await POST(anfrage({ phone: '491701234567', text: 'Hallo' }))
    expect(res.status).toBe(500)
    expect(waTexte).toHaveLength(0)
  })
})

describe('baileys/inbound — Team-WA nur EINMALIG bei Neukontakt', () => {
  it('erste Nachricht dieser Nummer -> genau eine Team-WA', async () => {
    state.nachrichtenCount = 1
    await POST(anfrage({ phone: '491701234567', text: 'Hallo, ich hatte einen Unfall' }))
    expect(waTexte).toHaveLength(1)
    expect(waTexte[0]).toContain('491701234567')
  })

  it('FOLGEnachricht derselben Nummer -> KEINE weitere Team-WA', async () => {
    state.nachrichtenCount = 4
    await POST(anfrage({ phone: '491701234567', text: 'noch eine Frage' }))
    expect(waTexte).toHaveLength(0)
  })

  it('Partner-Folgenachricht meldet auch nicht erneut (kein Lead = kein Marker)', async () => {
    // Der Fall, den die alte Logik falsch machte: ein Partner bekommt nie einen
    // Lead, also fand matchInboundToFall ihn nie -> jede Nachricht meldete.
    state.istPartner = true
    state.partnerBezeichnung = 'sachverstaendiger Gaith Hamed'
    state.nachrichtenCount = 6
    await POST(anfrage({ phone: '491735633541', text: 'dritte Nachricht' }))
    expect(waTexte).toHaveLength(0)
  })

  it('Partner-ERSTkontakt meldet einmal, mit Bezeichnung', async () => {
    state.istPartner = true
    state.partnerBezeichnung = 'sachverstaendiger Gaith Hamed'
    state.nachrichtenCount = 1
    await POST(anfrage({ phone: '491735633541', text: 'Hallo' }))
    expect(waTexte).toHaveLength(1)
    expect(waTexte[0]).toContain('Gaith Hamed')
  })

  it('Bestandskunde mit Fall, der erstmals per WhatsApp schreibt -> meldet einmal', async () => {
    state.match = { fallId: 'fall-1', leadId: null, multipleCandidates: false, candidates: [] }
    state.nachrichtenCount = 1
    await POST(anfrage({ phone: '4915759392549', text: 'Bitte um das Gutachten' }))
    expect(waTexte).toHaveLength(1)
  })

  it('Zaehlung schlaegt fehl -> lieber nicht melden als bei jeder Nachricht melden', async () => {
    state.countError = { message: 'zaehlung kaputt' }
    await POST(anfrage({ phone: '491701234567', text: 'Hallo' }))
    expect(waTexte).toHaveLength(0)
  })
})
