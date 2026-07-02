// Filmcheck-Haertung 2026-07-02: Unit-Tests fuer extractGutachtenAndSaveToClaim.
//
// Fokus: die base64-PDF-Haertung (Bytes selbst laden statt Anthropic unsere
// Storage-URL fetchen lassen) + Idempotenz + No-JSON-Fehlerpfad.
//
// Gemockt: @/lib/supabase/admin (fall_dokumente-Lookup + storage.download +
// rpc('apply_gutachten_ocr')) und @anthropic-ai/sdk (fixe JSON-Antwort).
// Chain-Mock-Pattern (Response-Queue) wie process-inbound-media.test.ts.

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─── Supabase-Admin-Mock ───────────────────────────────────────────────────────

type DbResponse = { data: unknown; error: unknown }

// Named responses keyed by table — robuster als eine flache FIFO-Queue, weil
// die Reihenfolge der Reads je nach manuellUeberschrieben-Flag variiert.
const responsesByTable: Record<string, DbResponse[]> = {}
function queueResponse(table: string, r: DbResponse) {
  ;(responsesByTable[table] ??= []).push(r)
}
function nextResponse(table: string): DbResponse {
  return responsesByTable[table]?.shift() ?? { data: null, error: null }
}

const rpcCalls: Array<{ fn: string; args: unknown }> = []
const insertsByTable: Record<string, unknown[]> = {}
const downloadCalls: string[] = []

// download() liefert per Default ein "PDF"-Blob; einzelne Tests koennen es
// ueberschreiben (z.B. Fehler simulieren).
let downloadImpl: (path: string) => Promise<{ data: unknown; error: unknown }> = async () => ({
  data: {
    arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7 fake bytes').buffer,
  },
  error: null,
})

function makeChain(table: string) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = {
    select: () => h,
    insert: (payload: unknown) => {
      ;(insertsByTable[table] ??= []).push(payload)
      return h
    },
    eq: () => h,
    in: () => h,
    is: () => h,
    like: () => h,
    order: () => h,
    limit: () => Promise.resolve(nextResponse(table)),
    single: () => Promise.resolve(nextResponse(table)),
    maybeSingle: () => Promise.resolve(nextResponse(table)),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(nextResponse(table)).then(resolve),
  }
  return h
}

const mockAdmin = {
  from(table: string) {
    return makeChain(table)
  },
  storage: {
    from(_bucket: string) {
      return {
        download: (path: string) => {
          downloadCalls.push(path)
          return downloadImpl(path)
        },
      }
    },
  },
  rpc: (fn: string, args: unknown) => {
    rpcCalls.push({ fn, args })
    return Promise.resolve({ error: null })
  },
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => mockAdmin,
}))

// ─── Anthropic-SDK-Mock ─────────────────────────────────────────────────────────

// Fixe Modell-Antwort — jeder Test setzt anthropicText auf den gewuenschten Body.
let anthropicText = ''
// Rest-Param, damit mock.calls[i] ein non-empty Tuple ist (sonst TS2493 beim [0]).
const anthropicCreate = vi.fn(async (..._args: unknown[]) => ({
  content: [{ type: 'text', text: anthropicText }],
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = { create: anthropicCreate }
  },
}))

import { extractGutachtenAndSaveToClaim } from './gutachten-ocr'

// ─── Fixtures ───────────────────────────────────────────────────────────────────

const CLAIM_ID = 'claim-123'
const AUFTRAG_ID = 'auftrag-abc'
const STORAGE_PATH = `claims/${CLAIM_ID}/gutachten/${AUFTRAG_ID}/gutachten.pdf`

// Vollstaendiges, gueltiges OCR-JSON (Betraege bereits normalisiert).
const VALID_JSON = JSON.stringify({
  reparaturkosten_netto: 3245.67,
  reparaturkosten_brutto: 3862.35,
  minderwert: 500,
  fin: 'WBA1234567890ABCDE',
  kennzeichen: 'B-AB 1234',
  totalschaden: false,
})

function seedHappyPath(opts?: { existing?: DbResponse }) {
  // 1) auftraege-Lookup
  queueResponse('auftraege', {
    data: { id: AUFTRAG_ID, fall_id: 'fall-1', claim_id: CLAIM_ID, gutachten_url: 'https://old/gutachten.pdf' },
    error: null,
  })
  // 2) v_gutachten_werte — Idempotenz-Check
  queueResponse('v_gutachten_werte', opts?.existing ?? { data: {}, error: null })
  // 3) fall_dokumente — storage_path-Lookup (neuer Pfad)
  queueResponse('fall_dokumente', {
    data: [{ id: 'dok-1', storage_path: STORAGE_PATH, dokument_typ: 'gutachten' }],
    error: null,
  })
}

beforeEach(() => {
  for (const k of Object.keys(responsesByTable)) delete responsesByTable[k]
  for (const k of Object.keys(insertsByTable)) delete insertsByTable[k]
  rpcCalls.length = 0
  downloadCalls.length = 0
  anthropicText = ''
  anthropicCreate.mockClear()
  downloadImpl = async () => ({
    data: { arrayBuffer: async () => new TextEncoder().encode('%PDF-1.7 fake bytes').buffer },
    error: null,
  })
  process.env.ANTHROPIC_API_KEY = 'test-key'
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://x.supabase.co'
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'svc'
})

// ─── Tests ──────────────────────────────────────────────────────────────────────

describe('extractGutachtenAndSaveToClaim', () => {
  it('(a) valides JSON -> apply_gutachten_ocr mit gemappten Flat-Feldern; PDF als base64 gesendet', async () => {
    seedHappyPath()
    anthropicText = VALID_JSON

    const res = await extractGutachtenAndSaveToClaim(AUFTRAG_ID)
    expect(res.ok).toBe(true)

    // Bytes wurden selbst geladen (base64-Haertung), nicht per URL-Fetch delegiert.
    expect(downloadCalls).toContain(STORAGE_PATH)
    const sendArgs = anthropicCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ type: string; source?: { type: string; media_type?: string; data?: string } }> }>
    }
    const docBlock = sendArgs.messages[0].content.find((c) => c.type === 'document')
    expect(docBlock?.source?.type).toBe('base64')
    expect(docBlock?.source?.media_type).toBe('application/pdf')
    expect(typeof docBlock?.source?.data).toBe('string')
    expect((docBlock?.source?.data ?? '').length).toBeGreaterThan(0)

    // apply_gutachten_ocr mit gemappten Flat-Feldern (FIELD_MAP: fin -> gutachten_fin).
    const apply = rpcCalls.find((c) => c.fn === 'apply_gutachten_ocr')
    expect(apply).toBeDefined()
    const vals = (apply!.args as { p_claim_id: string; p_values: Record<string, unknown> }).p_values
    expect((apply!.args as { p_claim_id: string }).p_claim_id).toBe(CLAIM_ID)
    expect(vals.reparaturkosten_netto).toBe(3245.67)
    expect(vals.gutachten_fin).toBe('WBA1234567890ABCDE')
    expect(vals.gutachten_kennzeichen).toBe('B-AB 1234')
    expect(vals.gutachten_ocr_error).toBeNull()
  })

  it('(b) bereits verarbeitet (processed_at gesetzt) + !force -> ok ohne Anthropic-Call', async () => {
    seedHappyPath({
      existing: { data: { gutachten_ocr_processed_at: '2026-07-01T10:00:00Z' }, error: null },
    })
    anthropicText = VALID_JSON

    const res = await extractGutachtenAndSaveToClaim(AUFTRAG_ID)
    expect(res.ok).toBe(true)
    expect(anthropicCreate).not.toHaveBeenCalled()
    expect(rpcCalls.find((c) => c.fn === 'apply_gutachten_ocr')).toBeUndefined()
    expect(downloadCalls).toHaveLength(0)
  })

  it('(c) keine JSON-Antwort -> schreibt gutachten_ocr_error via apply_gutachten_ocr', async () => {
    seedHappyPath()
    anthropicText = 'Ich konnte das Dokument leider nicht auslesen.'

    const res = await extractGutachtenAndSaveToClaim(AUFTRAG_ID)
    expect(res.ok).toBe(false)

    const apply = rpcCalls.find((c) => c.fn === 'apply_gutachten_ocr')
    expect(apply).toBeDefined()
    const vals = (apply!.args as { p_values: Record<string, unknown> }).p_values
    expect(vals.gutachten_ocr_error).toBeTruthy()
    expect(vals.gutachten_ocr_processed_at).toBeTruthy()
  })

  it('Fallback: kein storage_path gefunden -> URL-Pfad (kein download, source=url) statt Abbruch', async () => {
    // auftraege + Idempotenz seed, aber fall_dokumente liefert leere Liste.
    queueResponse('auftraege', {
      data: { id: AUFTRAG_ID, fall_id: 'fall-1', claim_id: CLAIM_ID, gutachten_url: 'https://old/gutachten.pdf' },
      error: null,
    })
    queueResponse('v_gutachten_werte', { data: {}, error: null })
    queueResponse('fall_dokumente', { data: [], error: null })
    anthropicText = VALID_JSON

    const res = await extractGutachtenAndSaveToClaim(AUFTRAG_ID)
    expect(res.ok).toBe(true)
    expect(downloadCalls).toHaveLength(0)
    const sendArgs = anthropicCreate.mock.calls[0]?.[0] as {
      messages: Array<{ content: Array<{ type: string; source?: { type: string; url?: string } }> }>
    }
    const docBlock = sendArgs.messages[0].content.find((c) => c.type === 'document')
    expect(docBlock?.source?.type).toBe('url')
    expect(docBlock?.source?.url).toBe('https://old/gutachten.pdf')
  })
})
