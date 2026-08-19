// AAR-939 (Baileys Task B): Unit-Tests fuer process-inbound-text.ts
//
// Gemockter Supabase-Admin-Client + gemockte Shared-Helper.
// Die match-Logik (matchInboundToFall) ist Sache des Callers — wird hier
// direkt als Argument uebergeben (kein Mock noetig).

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { detectIntent } from '../process-inbound-text'

// ─── Supabase-Mock ────────────────────────────────────────────────────────────
// Jeder from()-Aufruf gibt denselben chainable Handler zurueck.
// Antworten werden per setNextResponse() in eine Queue gestellt.

type DbResponse = { data: unknown; error: unknown }

const responseQueue: DbResponse[] = []
function setNextResponse(r: DbResponse) {
  responseQueue.push(r)
}
function nextResponse(): DbResponse {
  return responseQueue.shift() ?? { data: null, error: null }
}

// Track all update calls to gutachter_termine
const updatePayloads: unknown[] = []

function makeChainableBuilder() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = {
    select: () => h,
    insert: () => h,
    update: (payload: unknown) => { updatePayloads.push(payload); return h },
    eq: () => h,
    in: () => h,
    not: () => h,
    or: () => h,
    lt: () => h,
    gte: () => h,
    is: () => h,
    order: () => h,
    limit: () => h,
    single: () => Promise.resolve(nextResponse()),
    maybeSingle: () => Promise.resolve(nextResponse()),
    // Promise-like: allows await on the builder
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(nextResponse()).then(resolve),
  }
  return h
}

const mockAdmin = {
  from(_table: string) {
    return makeChainableBuilder()
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}))

// ─── Helper-Mocks ─────────────────────────────────────────────────────────────

const closeNurGutachterSpy = vi.fn().mockResolvedValue({ ok: true })
vi.mock('@/lib/termine/close-nur-gutachter-termin', () => ({
  closeNurGutachterTerminAlsDurchgefuehrt: (...args: unknown[]) => closeNurGutachterSpy(...args),
}))

const createEmbedBKlaerungSpy = vi.fn().mockResolvedValue({ ok: true, created: true })
vi.mock('@/lib/termine/embed-b-klaerung-task', () => ({
  createEmbedBKlaerungTask: (...args: unknown[]) => createEmbedBKlaerungSpy(...args),
  TERMIN_RESOLUTION_EXCLUDED_IN_CLAUSE:
    '("storniert","abgesagt","abgelehnt","verlegt","verlegung_pending","abgeschlossen","verschoben")',
}))

const sendCommunicationSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/communications/send', () => ({
  sendCommunication: (...args: unknown[]) => sendCommunicationSpy(...args),
}))

const createNotificationSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notifications', () => ({
  createNotification: (...args: unknown[]) => createNotificationSpy(...args),
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  responseQueue.length = 0
  updatePayloads.length = 0
  closeNurGutachterSpy.mockClear()
  createEmbedBKlaerungSpy.mockClear()
  sendCommunicationSpy.mockClear()
  createNotificationSpy.mockClear()
})

// ─── detectIntent Tests ────────────────────────────────────────────────────────

describe('detectIntent', () => {
  it('JA => termin_bestaetigung_ja', () => {
    expect(detectIntent('JA')).toBe('termin_bestaetigung_ja')
    expect(detectIntent('ja')).toBe('termin_bestaetigung_ja')
    expect(detectIntent('Ok')).toBe('termin_bestaetigung_ja')
    expect(detectIntent('JAA')).toBe('termin_bestaetigung_ja')
    expect(detectIntent('BESTÄTIGT')).toBe('termin_bestaetigung_ja')
    expect(detectIntent('BESTAETIGT')).toBe('termin_bestaetigung_ja')
  })

  it('NEIN => termin_bestaetigung_nein', () => {
    expect(detectIntent('NEIN')).toBe('termin_bestaetigung_nein')
    expect(detectIntent('nein')).toBe('termin_bestaetigung_nein')
    expect(detectIntent('NEIN DANKE')).toBe('termin_bestaetigung_nein')
    expect(detectIntent('NEINN')).toBe('termin_bestaetigung_nein')
  })

  it('verschieben bitte => umtermin', () => {
    expect(detectIntent('verschieben bitte')).toBe('umtermin')
    expect(detectIntent('bitte umtermin')).toBe('umtermin')
    expect(detectIntent('Anderen Termin bitte')).toBe('umtermin')
  })

  it('hallo => unknown', () => {
    expect(detectIntent('hallo')).toBe('unknown')
    expect(detectIntent('')).toBe('unknown')
    expect(detectIntent('  ')).toBe('unknown')
    expect(detectIntent('danke')).toBe('unknown')
  })
})

// ─── processInboundText Tests ─────────────────────────────────────────────────

describe('processInboundText', () => {
  it('gibt handled:false zurueck wenn intent unknown', async () => {
    const { processInboundText } = await import('../process-inbound-text')
    const result = await processInboundText(mockAdmin as never, {
      fromPhone: '+491701234567',
      body: 'Hallo, ich habe eine Frage',
      match: { fallId: 'fall-1', leadId: 'lead-1', multipleCandidates: false, candidates: [] },
    })
    expect(result.handled).toBe(false)
    expect(closeNurGutachterSpy).not.toHaveBeenCalled()
    expect(createEmbedBKlaerungSpy).not.toHaveBeenCalled()
  })

  it('JA + zukuenftiger Termin vorhanden => update status=bestaetigt + handled:true', async () => {
    // embed-B: kein staler Termin (leeres Array)
    setNextResponse({ data: [], error: null })
    // Termin-Bestaetigung: naechster zukuenftiger Termin
    setNextResponse({ data: { id: 'termin-future-1' }, error: null })

    const { processInboundText } = await import('../process-inbound-text')
    const result = await processInboundText(mockAdmin as never, {
      fromPhone: '+491701234567',
      body: 'JA',
      match: { fallId: 'fall-1', leadId: 'lead-1', multipleCandidates: false, candidates: [] },
    })

    expect(result.handled).toBe(true)
    // Update-Payload enthaelt status: 'bestaetigt'
    expect(updatePayloads).toContainEqual({ status: 'bestaetigt' })
    expect(closeNurGutachterSpy).not.toHaveBeenCalled()
    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('Bestätigung') }),
    )
  })

  it('JA + staler nur_gutachter-Termin => closeNurGutachterTermin gerufen + handled:true', async () => {
    // staleKandidaten: ein nur_gutachter-Termin, nicht terminal
    setNextResponse({
      data: [
        {
          id: 'termin-stale-1',
          claim_id: 'claim-1',
          fall_id: 'fall-1',
          lead_id: null,
          claims: { service_typ: 'nur_gutachter', operative_status: 'sv-termin' },
        },
      ],
      error: null,
    })
    // CMM-49: die byUserId-Attribution kommt jetzt aus claims.geschaedigter_user_id,
    // nicht mehr aus faelle.kunde_id. Der Mock lieferte weiter `kunde_id` -> byUserId
    // wurde still `null`, der Aufruf fand aber statt (also kein Crash, nur eine
    // verlorene Zuordnung im Test). Produktionscode ist korrekt.
    setNextResponse({ data: { geschaedigter_user_id: 'kunde-uuid' }, error: null })

    const { processInboundText } = await import('../process-inbound-text')
    const result = await processInboundText(mockAdmin as never, {
      fromPhone: '+491701234567',
      body: 'JA',
      match: { fallId: 'fall-1', leadId: null, multipleCandidates: false, candidates: [] },
    })

    expect(result.handled).toBe(true)
    expect(closeNurGutachterSpy).toHaveBeenCalledOnce()
    expect(closeNurGutachterSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        terminId: 'termin-stale-1',
        claimId: 'claim-1',
        byUserId: 'kunde-uuid',
      }),
    )
    expect(createEmbedBKlaerungSpy).not.toHaveBeenCalled()
    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('Gutachter da war') }),
    )
  })

  it('NEIN + staler Termin (Array-Form claims) => createEmbedBKlaerungTask gerufen + handled:true', async () => {
    // staleKandidaten: ein nur_gutachter-Termin, claims als Array (Nested-FK Array-Form)
    setNextResponse({
      data: [
        {
          id: 'termin-stale-2',
          claim_id: 'claim-2',
          fall_id: 'fall-1',
          lead_id: 'lead-1',
          claims: [{ service_typ: 'nur_gutachter', operative_status: 'sv-termin' }],
        },
      ],
      error: null,
    })

    const { processInboundText } = await import('../process-inbound-text')
    const result = await processInboundText(mockAdmin as never, {
      fromPhone: '+491701234567',
      body: 'NEIN',
      match: { fallId: 'fall-1', leadId: 'lead-1', multipleCandidates: false, candidates: [] },
    })

    expect(result.handled).toBe(true)
    expect(createEmbedBKlaerungSpy).toHaveBeenCalledOnce()
    expect(createEmbedBKlaerungSpy).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        terminId: 'termin-stale-2',
        grund: 'kunde_meldet_sv_no_show',
      }),
    )
    expect(closeNurGutachterSpy).not.toHaveBeenCalled()
    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('neuen Terminvorschlag') }),
    )
  })
})
