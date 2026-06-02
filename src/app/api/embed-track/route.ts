import { NextRequest, NextResponse } from 'next/server'

/**
 * AAR-939 · Monika-Embed · Stream 5 — Server-Tracking /api/embed-track
 *
 * Empfaengt das Client-Beacon des Widgets (tracking.ts: sendBeacon/keepalive).
 * Cross-Origin (CORS *). Best-effort: validiert die Form, loggt (Server-Log /
 * Sentry-Breadcrumb), antwortet 204. Forwarding an Plausible / Google-Ads-
 * Conversions-API ist Phase-2 (Stream 8b) und greift erst wenn GADS_*-ENV
 * gesetzt sind.
 *
 * HINWEIS: Die im Plan vorgesehene Tabelle embed_widget_events wurde in Stream 1
 * NICHT angelegt (bewusst — DB-minimaler Schnitt). Persistente Events kommen mit
 * Stream 8b (eigene Migration), bis dahin nur Log. Kein DB-Write hier.
 */

export const dynamic = 'force-dynamic'

// CORS: das Widget-Beacon (navigator.sendBeacon) ist credentialed -> Wildcard '*'
// ist mit credentials inkompatibel (Browser blockt die Preflight). Daher die
// Request-Origin echoen + Allow-Credentials. Reiner Log-Sink (kein DB-Write, nur
// ALLOWED_EVENTS) -> das Echoen beliebiger Origins ist unkritisch. Vary:Origin
// fuer Cache-Korrektheit.
function corsFor(req: NextRequest): Record<string, string> {
  const origin = req.headers.get('origin')
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  }
  if (origin) {
    headers['Access-Control-Allow-Credentials'] = 'true'
    headers['Vary'] = 'Origin'
  }
  return headers
}

const ALLOWED_EVENTS = new Set([
  'monika_shown',
  'monika_open',
  'monika_qualify_yes',
  'monika_qualify_no',
  'monika_form_shown',
  'monika_anfrage_submit',
])

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, { status: 204, headers: corsFor(req) })
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = (await req.json()) as Record<string, unknown>
  } catch {
    return new NextResponse(null, { status: 204, headers: corsFor(req) }) // Beacon: nie hart fehlschlagen
  }

  const event = typeof body.event === 'string' ? body.event : null
  // Nur bekannte Monika-Events zaehlen — fremde Payloads still verwerfen.
  if (event && ALLOWED_EVENTS.has(event)) {
    console.info('[AAR-939] embed-track', {
      event,
      source: body.source ?? null,
      cluster: body.cluster ?? null,
      stadt: body.stadt ?? null,
      embed_site: body.embed_site ?? null,
    })
    // TODO Stream 8b: in embed_widget_events persistieren + Plausible/GAds-Forward.
  }

  return new NextResponse(null, { status: 204, headers: corsFor(req) })
}
