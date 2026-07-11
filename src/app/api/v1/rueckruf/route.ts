// MCP/API — Telefon-Rückruf anfordern (der zweite Funnel-Arm neben melde-schaden).
// POST /api/v1/rueckruf
//
// Für Kunden, die lieber zurückgerufen werden wollen (oder wenn kein Slot passt /
// die Daten unvollständig sind). Server-to-server (kein Browser-Origin → strenger
// Rate-Limit + Consent-Pflicht). Wrappt den BESTEHENDEN Funnel — KEIN Fork:
//   insertAnfrage (gfa, source='mcp') → issueCanonicalFlowLinkForAnfrage(send:false)
//   legt den Lead an (round-robin-Dispatcher zugewiesen, KEIN WhatsApp-Versand) →
//   upsertReservierungsRueckruf (admin_termine typ='rueckruf', in /dispatch/rueckrufe).
//
// Consent (Stage 1, pure-chat): einwilligung.zugestimmt MUSS true sein → consent_records-
// Audit (Kategorie rueckruf). Kein Token/keine PII zurück ins LLM.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { insertAnfrage } from '@/lib/embed/anfrage'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { upsertReservierungsRueckruf } from '@/lib/embed/reservierungs-rueckruf'
import { findRecentMcpLead } from '@/lib/api-v1/recent-lead-dedup'
import {
  phoneWriteCapExceeded,
  globalWriteCapExceeded,
  recordGlobalWrite,
} from '@/lib/api-v1/write-abuse-guard'
import type { EmbedAnfrageInput } from '@/lib/schemas/embed-anfrage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Strenger als der Read (60/min): ein Write legt einen Lead + Dispatch-Task an.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10
const ipHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  ipHits.set(ip, hits)
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k)
  }
  return hits.length > RATE_MAX
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

const PHONE_RE = /^\+?[0-9\s\-/()]{8,20}$/
const RueckrufSchema = z.object({
  name: z.string().trim().min(2).max(80),
  telefon: z.string().trim().regex(PHONE_RE),
  /** Optionaler Kontext für den Dispatcher — Schadenart + freie Schilderung des Anliegens. */
  schadenart: z.string().trim().max(80).optional(),
  anliegen: z.string().trim().max(1000).optional(),
  /** Optionaler Standort (hilft dem Berater) — PLZ ODER Freitext-Ort. */
  plz: z.string().regex(/^\d{5}$/).optional(),
  ort: z.string().trim().min(2).max(120).optional(),
  /** Optionale Wunschzeit für den Rückruf (ISO-8601). Ohne → schnellstmöglich (ASAP). */
  wunschzeit: z.string().max(40).optional(),
  /** Stage-1-Einwilligung — Pflicht. zugestimmt MUSS true sein, sonst kein Write. */
  einwilligung: z.object({
    zugestimmt: z.literal(true),
    policy_version: z.string().min(1).max(40),
  }),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  // Kanal-Attribution: die echte User-Agent des Aufrufers ('claimondo-mcp-server/<v>' = via
  // unseren MCP-Server; ChatGPT-/OpenAI-UA = GPT-Action direkt; sonst Direktaufruf) wird unten
  // in consent_records.user_agent persistiert -> Aggregat-Auswertung der Lead-Quelle.
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 200) || 'unknown'
  if (rateLimited(ip)) {
    return json({ ok: false, error: 'Rate limit exceeded (10 requests/minute)' }, 429)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }
  const parsed = RueckrufSchema.safeParse(raw)
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === 'einwilligung')
    return json(
      {
        ok: false,
        error: consentMissing ? 'einwilligung_erforderlich' : 'validation',
        issues: parsed.error.issues.map((i) => i.path.join('.')),
      },
      400,
    )
  }
  const input = parsed.data

  // Idempotenz (Retry-Dedup): wiederholt der LLM-Client den Tool-Call, verwenden wir den
  // bereits angelegten Rückruf-Lead wieder, statt einen zweiten Lead + Dispatch-Task zu
  // erzeugen. Siehe src/lib/api-v1/recent-lead-dedup.ts.
  const dup = await findRecentMcpLead(input.telefon)
  if (dup) {
    return json(
      {
        ok: true,
        status: 'bereits_angelegt',
        wiederverwendet: true,
        wann: 'schnellstmöglich',
        hinweis:
          'Rückruf wurde bereits angefordert — ein Claimondo-Berater meldet sich schnellstmöglich telefonisch. Bitte nicht erneut anfordern.',
      },
      200,
    )
  }

  // Abuse-Härtung (öffentlicher Write-Endpoint, breit an externe KI-Assistenten): IP-unabhängige
  // Backstops zusätzlich zum Per-IP-Limit. NACH der Retry-Dedup, damit Retries nicht zählen, und
  // VOR jedem Insert, damit ein geblockter Request weder Lead noch Dispatch-Task erzeugt.
  //   1. Per-Telefon-Velocity — stoppt Rückruf-Bombing derselben Opfer-Nummer.
  //   2. Globaler Circuit-Breaker — deckelt Massen-Spam prozessweit (teilt sich das Cap mit melde-schaden).
  if (await phoneWriteCapExceeded(input.telefon)) {
    return json(
      {
        ok: false,
        error: 'phone_rate_limit',
        hinweis:
          'Für diese Telefonnummer wurden in kurzer Zeit zu viele Rückruf-Anfragen angelegt. Bitte später erneut versuchen oder direkt telefonisch melden.',
      },
      429,
    )
  }
  if (globalWriteCapExceeded()) {
    return json(
      {
        ok: false,
        error: 'service_busy',
        hinweis: 'Aktuell sehr viele Anfragen — bitte in wenigen Minuten erneut versuchen.',
      },
      429,
    )
  }
  recordGlobalWrite()

  // Standort optional: PLZ oder Freitext-Ort geocoden (best-effort, non-fatal).
  let lat: number | undefined
  let lng: number | undefined
  const geoQuery = input.plz ?? (input.ort ? `${input.ort}, Deutschland` : null)
  if (geoQuery) {
    const c = await geocodeAdresse(geoQuery)
    if (c) {
      lat = c.lat
      lng = c.lng
    }
  }

  const consentTs = new Date().toISOString()

  // 1. Anfrage anlegen (gfa, source='mcp') — minimal, KEIN SV/Slot (das ist ein Rückruf).
  const payload: EmbedAnfrageInput = {
    name: input.name,
    telefon: input.telefon,
    schadentyp: input.schadenart ?? 'Rückruf-Wunsch',
    schadens_kurzbeschreibung: input.anliegen ?? 'Rückruf-Wunsch (über KI-Assistent angefragt).',
    source: 'mcp',
    besichtigungsort_lat: lat,
    besichtigungsort_lng: lng,
    consent_ts: consentTs,
    aktion: 'senden',
  }
  const ins = await insertAnfrage({ payload, variante: null, embedSiteId: null, originDomain: 'mcp' })
  if (!ins.ok) {
    console.error('[rueckruf] insertAnfrage fehlgeschlagen:', ins.error)
    return json({ ok: false, error: 'insert_failed' }, 500)
  }

  // 2. Lead anlegen (idempotent, round-robin-Dispatcher) OHNE Versand — wir rufen
  //    zurück statt einen Link zu schicken. Liefert die leadId für den Rückruf-Task.
  const issued = await issueCanonicalFlowLinkForAnfrage(ins.anfrageId, { send: false })
  if (!issued.ok) {
    console.error('[rueckruf] issueCanonical fehlgeschlagen:', issued.error)
    return json({ ok: false, error: 'lead_failed' }, 500)
  }

  const admin = createAdminClient()

  // 3. Stage-1-Consent-Audit (non-fatal).
  try {
    await admin.from('consent_records').insert({
      categories: ['mcp_rueckruf', 'telefon_kontakt', 'drittland_llm'],
      policy_version: input.einwilligung.policy_version,
      user_agent: ua,
      created_at: consentTs,
    })
  } catch (err) {
    console.error('[rueckruf] consent_records insert fehlgeschlagen:', err)
  }

  // 4. Rückruf-Task in die Dispatch-Queue (admin_termine typ='rueckruf'). Wunschzeit →
  //    vonKunde=true; sonst ASAP (now+5min, vonKunde=false). NON-FATAL: scheitert der
  //    strukturierte Task, hängt der Lead trotzdem zugewiesen in der Queue.
  let startIso: string | null = null
  let vonKunde = false
  if (input.wunschzeit) {
    const d = new Date(input.wunschzeit)
    if (!Number.isNaN(d.getTime())) {
      startIso = d.toISOString()
      vonKunde = true
    }
  }
  if (!startIso) startIso = new Date(Date.now() + 5 * 60_000).toISOString()

  let taskOk = false
  try {
    const rr = await upsertReservierungsRueckruf({ leadId: issued.leadId, startIso, vonKunde })
    taskOk = rr.ok
    if (!rr.ok) console.error('[rueckruf] upsertReservierungsRueckruf:', rr.error)
  } catch (err) {
    console.error('[rueckruf] upsertReservierungsRueckruf-Fehler:', err)
  }

  return json(
    {
      ok: true,
      status: taskOk ? 'rueckruf_angelegt' : 'lead_angelegt',
      wann: vonKunde ? startIso : 'schnellstmöglich',
      hinweis: vonKunde
        ? 'Rückruf vorgemerkt. Ein Claimondo-Berater meldet sich zur gewünschten Zeit telefonisch — kostenlos und unverbindlich.'
        : 'Ein Claimondo-Berater ruft den Kunden schnellstmöglich (in der Regel < 15 Min) zurück — kostenlos und unverbindlich. Kein Link im Chat (Datenschutz).',
    },
    200,
  )
}
