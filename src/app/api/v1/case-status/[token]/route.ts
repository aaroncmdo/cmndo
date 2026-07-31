// MCP/API — Fall-Status per FlowLink-Token abfragen (read-only, coarse, PII-frei).
// GET /api/v1/case-status/{token}
//
// Damit ein wiederkehrender Kunde seinen KI-Assistenten "wo steht mein Fall?" fragen kann:
// er uebergibt sein EIGENES Token (aus dem Claimondo-Link, den er per WhatsApp erhalten
// hat) — das Token ist die Autorisierung (Bearer). Das Write-Design gibt das Token bewusst
// NICHT in den Chat zurueck; der Kunde muss es also selbst aus seinem Link nennen (kein
// Bruch der No-Token-im-Chat-Regel).
//
// Antwort ist bewusst GROB + PII-FREI: nur ein kunden-facing Status-Label (coarseKundeStatus)
// + ein generischer Hinweis — kein Name/Telefon/SV/Fall-Detail, kein roher Status-Code. So
// leakt nichts Sensibles in den 3rd-Party-LLM-Chat. Invalid/unbekanntes Token -> EIN
// generisches 404 (keine Enumeration: kein Signal, ob ein Token existiert).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { coarseKundeStatus } from '@/lib/api-v1/case-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Read-Rate-Limit (wie sv-in-naehe/gutachter-termine): 60/min/IP, in-process (PM2-Single).
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
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
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

// FlowLink-Token: opak, url-safe. Format-Guard vor dem DB-Hit (spart Query + haelt die
// Fehlerform generisch).
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return json({ ok: false, error: 'Rate limit exceeded (60 requests/minute)' }, 429)
  }

  const token = (await params).token

  // EIN generisches 404 fuer ALLE "kein gueltiger Fall"-Faelle (Format, unbekanntes Token,
  // kein verknuepfter Lead) -> keine Enumeration.
  const notFound = () =>
    json(
      {
        ok: false,
        error: 'not_found',
        hinweis:
          'Kein Fall zu dieser Referenz gefunden. Bitte prüfe die Referenz aus deinem persönlichen Claimondo-Link (per WhatsApp erhalten).',
      },
      404,
    )

  if (!TOKEN_RE.test(token)) return notFound()

  const admin = createAdminClient()

  // Token -> lead_id (der FlowLink ist lead-gebunden).
  const { data: fl } = await admin.from('flow_links').select('lead_id').eq('token', token).maybeSingle()
  const leadId = (fl?.lead_id as string | null) ?? null
  if (!leadId) return notFound()

  // lead_id -> Claim (operative_status). Ein Lead hat i.d.R. genau einen Claim; die erste
  // Zeile reicht fuer einen groben Status (kein ORDER BY -> kein Timestamp-Spaltennamen-
  // Risiko auf dem ungetypten Admin-Client). Kein Claim (Lead noch in Anlage) -> opStatus
  // null -> coarseKundeStatus liefert den freundlichen "eingegangen"-Sammel-Status.
  const { data: claimRows } = await admin
    .from('claims')
    .select('operative_status')
    .eq('lead_id', leadId)
    .limit(1)
  const opStatus =
    Array.isArray(claimRows) && claimRows.length > 0
      ? ((claimRows[0] as { operative_status: string | null }).operative_status ?? null)
      : null

  return json(
    {
      ok: true,
      status: coarseKundeStatus(opStatus),
      hinweis:
        'Grober Bearbeitungsstand. Details + nächste Schritte zeigt dein persönlicher Claimondo-Link (WhatsApp); bei Rückfragen melde dich direkt bei Claimondo.',
    },
    200,
  )
}
