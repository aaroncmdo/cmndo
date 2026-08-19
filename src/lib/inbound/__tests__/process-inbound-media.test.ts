// AAR-939 (Baileys Task C): Unit-Tests fuer process-inbound-media.ts
//
// Gemockter Supabase-Admin-Client + gemockte Shared-Helper.
// Bytes werden direkt als InboundMediaFile-Objekte uebergeben (provider-neutral).

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase-Mock ────────────────────────────────────────────────────────────
// Identisches Chain-Mock-Pattern wie process-inbound-text.test.ts.

type DbResponse = { data: unknown; error: unknown }

const responseQueue: DbResponse[] = []
function setNextResponse(r: DbResponse) {
  responseQueue.push(r)
}
function nextResponse(): DbResponse {
  return responseQueue.shift() ?? { data: null, error: null }
}

// Track update calls by table for assertions
const updatesByTable: Record<string, unknown[]> = {}
const insertsByTable: Record<string, unknown[]> = {}

function makeChainableBuilder(tableName: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = {
    select: () => h,
    insert: (payload: unknown) => {
      if (!insertsByTable[tableName]) insertsByTable[tableName] = []
      insertsByTable[tableName].push(payload)
      return h
    },
    update: (payload: unknown) => {
      if (!updatesByTable[tableName]) updatesByTable[tableName] = []
      updatesByTable[tableName].push(payload)
      return h
    },
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
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve(nextResponse()).then(resolve),
  }
  return h
}

const storageUploadMock = vi.fn().mockResolvedValue({ error: null })

const mockAdmin = {
  from(table: string) {
    return makeChainableBuilder(table)
  },
  storage: {
    from(_bucket: string) {
      return {
        upload: storageUploadMock,
        download: vi.fn().mockResolvedValue({ data: null, error: new Error('not mocked') }),
      }
    },
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}))

// ─── Helper-Mocks ─────────────────────────────────────────────────────────────

const runZB1OcrSpy = vi.fn().mockResolvedValue({
  fullText: 'WVW123456789ABCDEF\nA\nB-AB 123',
  extracted: {
    fin_vin: 'WVW123456789ABCDEF',
    kennzeichen: 'B-AB123',
    fahrzeug_hersteller: null,
    fahrzeug_modell: null,
    fahrzeug_baujahr: null,
    erstzulassung: null,
    halter_vorname: null,
    halter_nachname: null,
    halter_strasse: null,
    halter_plz: null,
    halter_stadt: null,
    hsn: null,
    tsn: null,
    brn: null,
    fahrzeug_farbe: null,
  },
})
vi.mock('@/lib/ocr/zb1-parser', () => ({
  runZB1Ocr: (...args: unknown[]) => runZB1OcrSpy(...args),
}))

const scheduleBkatSpy = vi.fn()
vi.mock('@/lib/bkat/auto-trigger', () => ({
  scheduleBkatAnalyseAfterUpload: (...args: unknown[]) => scheduleBkatSpy(...args),
}))

const getStorageUrlSpy = vi.fn().mockResolvedValue('https://example.supabase.co/storage/test-path')
vi.mock('@/lib/storage/url', () => ({
  getStorageUrl: (...args: unknown[]) => getStorageUrlSpy(...args),
}))

const sendCommunicationSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/communications/send', () => ({
  sendCommunication: (...args: unknown[]) => sendCommunicationSpy(...args),
}))

const createNotificationSpy = vi.fn().mockResolvedValue(undefined)
vi.mock('@/lib/notifications', () => ({
  createNotification: (...args: unknown[]) => createNotificationSpy(...args),
}))

// CMM-49 hat die KB-Aufloesung auf resolveClaimId + claims umgestellt. Ungemockt
// zieht resolveClaimId selbst ein bis zwei Eintraege aus der responseQueue und
// verschiebt damit ALLE folgenden Antworten — der Test brach dann an einer ganz
// anderen Stelle. Hier gemockt, damit dieser Unit-Test unabhaengig von den Interna
// der Aufloesung bleibt.
const resolveClaimIdSpy = vi.fn(async () => 'claim-abc')
vi.mock('@/lib/claims/get-claim-for-role', () => ({
  resolveClaimId: (...args: unknown[]) => resolveClaimIdSpy(...(args as [])),
}))

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  responseQueue.length = 0
  for (const key of Object.keys(updatesByTable)) delete updatesByTable[key]
  for (const key of Object.keys(insertsByTable)) delete insertsByTable[key]
  storageUploadMock.mockClear()
  runZB1OcrSpy.mockClear()
  scheduleBkatSpy.mockClear()
  getStorageUrlSpy.mockClear()
  sendCommunicationSpy.mockClear()
  createNotificationSpy.mockClear()
})

// ─── processInboundMedia Tests ─────────────────────────────────────────────────

describe('processInboundMedia', () => {
  it('gibt handled:false zurueck wenn keine mediaFiles', async () => {
    const { processInboundMedia } = await import('../process-inbound-media')
    const result = await processInboundMedia(mockAdmin as never, {
      fromPhone: '+491701234567',
      leadId: null,
      fallId: null,
      mediaFiles: [],
    })
    expect(result.handled).toBe(false)
    expect(storageUploadMock).not.toHaveBeenCalled()
  })

  it('Lead mit zb1_status="gesendet" + 1 Bild => runZB1Ocr gerufen + leads.update mit zb1_status:hochgeladen und fin', async () => {
    // leads.select response
    setNextResponse({
      data: {
        id: 'lead-1',
        vorname: 'Max',
        nachname: 'Mustermann',
        zb1_status: 'gesendet',
        zb1_gesendet_am: '2026-06-01T10:00:00Z',
        polizeibericht_status: null,
        polizeibericht_gesendet_am: null,
        polizei_aktenzeichen: null,
        zugewiesen_an: 'dispatcher-uuid',
      },
      error: null,
    })
    // dokument_upload_anfragen (syncDokumentUploadAnfrage — keine Anfragen)
    setNextResponse({ data: [], error: null })

    const { processInboundMedia } = await import('../process-inbound-media')
    const fakeBuffer = Buffer.from('fake-image-bytes')
    const result = await processInboundMedia(mockAdmin as never, {
      fromPhone: '+491701234567',
      leadId: 'lead-1',
      fallId: null,
      mediaFiles: [{ buffer: fakeBuffer, mime: 'image/jpeg' }],
    })

    expect(result.handled).toBe(true)
    expect(storageUploadMock).toHaveBeenCalledOnce()
    expect(runZB1OcrSpy).toHaveBeenCalledOnce()
    // runZB1Ocr bekommt den Buffer als base64
    expect(runZB1OcrSpy).toHaveBeenCalledWith(fakeBuffer.toString('base64'))

    // leads.update muss zb1_status:'hochgeladen' und fin enthalten
    const leadsUpdates = updatesByTable['leads'] ?? []
    expect(leadsUpdates.length).toBeGreaterThan(0)
    const zb1Update = leadsUpdates.find(
      (u): u is Record<string, unknown> =>
        typeof u === 'object' && u !== null && (u as Record<string, unknown>).zb1_status === 'hochgeladen',
    )
    expect(zb1Update).toBeDefined()
    expect(zb1Update?.fin).toBe('WVW123456789ABCDEF')
    expect(zb1Update?.kennzeichen).toBe('B-AB123')

    // WA-Bestaetigung an Kunden
    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('Fahrzeugschein') }),
    )
    // Dispatcher-Notification
    expect(createNotificationSpy).toHaveBeenCalledWith(
      'dispatcher-uuid',
      'zb1-hochgeladen',
      expect.any(String),
      expect.any(String),
      expect.stringContaining('lead-1'),
    )
  })

  it('Fall vorhanden + 1 Bild => fall_dokumente insert mit quelle:"whatsapp"', async () => {
    // Queue-Reihenfolge entspricht der Ausfuehrungs-Reihenfolge:
    // 1. fall_dokumente.insert (await -> then -> nextResponse)
    setNextResponse({ data: null, error: null })
    // 2. claims.select('kundenbetreuer_id, claim_nummer').eq('id', claimId).maybeSingle()
    //    CMM-49: FLACHE Form direkt aus claims — vorher kam das verschachtelt
    //    ueber faelle ({ claims: { … } }) und wurde hier nicht nachgezogen.
    setNextResponse({
      data: { kundenbetreuer_id: 'kb-uuid', claim_nummer: 'CLM-0042' },
      error: null,
    })
    // 3. timeline.insert (await -> then -> nextResponse)
    setNextResponse({ data: null, error: null })

    const { processInboundMedia } = await import('../process-inbound-media')
    const fakeBuffer = Buffer.from('fake-image-bytes')
    const result = await processInboundMedia(mockAdmin as never, {
      fromPhone: '+491701234567',
      leadId: null,
      fallId: 'fall-abc',
      mediaFiles: [{ buffer: fakeBuffer, mime: 'image/jpeg', filename: 'foto.jpg' }],
    })

    expect(result.handled).toBe(true)
    expect(storageUploadMock).toHaveBeenCalledOnce()
    expect(runZB1OcrSpy).not.toHaveBeenCalled()

    // fall_dokumente Insert muss quelle:'whatsapp' und fall_id enthalten
    const fdInserts = insertsByTable['fall_dokumente'] ?? []
    expect(fdInserts.length).toBeGreaterThan(0)
    const fdRow = fdInserts[0] as Record<string, unknown>
    expect(fdRow.quelle).toBe('whatsapp')
    expect(fdRow.fall_id).toBe('fall-abc')
    expect(fdRow.uploaded_by_kunde).toBe(true)
    expect(Array.isArray(fdRow.sichtbar_fuer)).toBe(true)
    expect(fdRow.sichtbar_fuer).toContain('kanzlei')

    // KB-Notification
    expect(createNotificationSpy).toHaveBeenCalledWith(
      'kb-uuid',
      'kunde-dokument-upload',
      expect.stringContaining('CLM-0042'),
      expect.any(String),
      expect.stringContaining('fall-abc'),
    )

    // WA-Bestaetigung
    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('Datei') }),
    )
  })

  it('Lead mit polizeibericht_status="gesendet" => polizeibericht-Pfad, kein ZB1-OCR, BKat-Trigger', async () => {
    setNextResponse({
      data: {
        id: 'lead-2',
        vorname: 'Erika',
        nachname: 'Musterfrau',
        zb1_status: null,
        zb1_gesendet_am: null,
        polizeibericht_status: 'gesendet',
        polizeibericht_gesendet_am: '2026-06-01T12:00:00Z',
        polizei_aktenzeichen: '001/26',
        zugewiesen_an: 'dispatcher-uuid-2',
      },
      error: null,
    })
    // dokument_upload_anfragen
    setNextResponse({ data: [], error: null })

    const { processInboundMedia } = await import('../process-inbound-media')
    const fakeBuffer = Buffer.from('fake-polizei-bericht')
    const result = await processInboundMedia(mockAdmin as never, {
      fromPhone: '+491701234567',
      leadId: 'lead-2',
      fallId: null,
      mediaFiles: [{ buffer: fakeBuffer, mime: 'image/jpeg' }],
    })

    expect(result.handled).toBe(true)
    expect(runZB1OcrSpy).not.toHaveBeenCalled()
    expect(scheduleBkatSpy).toHaveBeenCalledOnce()

    const leadsUpdates = updatesByTable['leads'] ?? []
    const pbUpdate = leadsUpdates.find(
      (u): u is Record<string, unknown> =>
        typeof u === 'object' && u !== null && (u as Record<string, unknown>).polizeibericht_status === 'hochgeladen',
    )
    expect(pbUpdate).toBeDefined()

    expect(sendCommunicationSpy).toHaveBeenCalledWith(
      'chat_fallback_kunde',
      expect.objectContaining({ '2': expect.stringContaining('Unfallmitteilung') }),
    )
    expect(createNotificationSpy).toHaveBeenCalledWith(
      'dispatcher-uuid-2',
      'polizeibericht-hochgeladen',
      expect.any(String),
      expect.any(String),
      expect.stringContaining('lead-2'),
    )
  })

  it('gibt handled:false zurueck wenn kein Lead und kein Fall', async () => {
    const { processInboundMedia } = await import('../process-inbound-media')
    const result = await processInboundMedia(mockAdmin as never, {
      fromPhone: '+491701234567',
      leadId: null,
      fallId: null,
      mediaFiles: [{ buffer: Buffer.from('x'), mime: 'image/jpeg' }],
    })
    expect(result.handled).toBe(false)
    expect(storageUploadMock).not.toHaveBeenCalled()
  })
})
