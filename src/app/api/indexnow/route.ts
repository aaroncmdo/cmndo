import { NextResponse } from 'next/server'
import { submitToIndexNow } from '@/lib/seo/indexnow'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Submitted when no explicit URL list is provided (the GEO-sprint AAR-938 spokes).
// Extend this list as new high-priority URLs go live.
const DEFAULT_URLS = [
  '/kfz-gutachter/vermittlungsportale-vergleich',
  '/kfz-gutachter/online-kfz-gutachten',
]

/**
 * GET /api/indexnow — submits the default URL set. Handy for a VPS cron:
 *   curl -fsS https://claimondo.de/api/indexnow
 */
export async function GET() {
  const result = await submitToIndexNow(DEFAULT_URLS)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}

/**
 * POST /api/indexnow  body: { urls?: string[] }
 * Submits the given URLs (relative paths or absolute claimondo.de URLs);
 * foreign hosts are dropped. Falls back to DEFAULT_URLS when no list is given.
 */
export async function POST(req: Request) {
  let urls: string[] = DEFAULT_URLS
  try {
    const body = (await req.json()) as { urls?: unknown }
    if (Array.isArray(body?.urls) && body.urls.length > 0) {
      urls = body.urls.filter((u): u is string => typeof u === 'string')
    }
  } catch {
    // no/invalid JSON body → fall back to defaults
  }
  const result = await submitToIndexNow(urls)
  return NextResponse.json(result, { status: result.ok ? 200 : 502 })
}
