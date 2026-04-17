// AAR-420: POST /api/branding/extract
//
// Wird vom Profil-UI (AAR-422 Child 4) nach Logo-Upload aufgerufen. Rückgabe
// ist die BrandPaletteExtraction — die UI zeigt Preview + Picker und schreibt
// erst nach User-Bestätigung in die DB.
//
// Rate-Limit: 5 Calls/min per SV (Claude-Vision kostet Geld).
// Cache: logoUrl → Ergebnis für 1h (Logos werden selten mehrfach analysiert,
// aber doppelte Submits aus UI-Retries passieren).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractBrandPalette, type BrandPaletteExtraction } from '@/lib/branding/extract-colors'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// ─── In-Memory Rate-Limit + Cache ──────────────────────────────────────────
// Einfache Maps — Vercel-Serverless-Instanzen reset bei Cold-Start (OK für MVP,
// ein späterer Upstash-Switch ist trivial).
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 5
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h

const rateBuckets = new Map<string, number[]>()
const paletteCache = new Map<string, { at: number; result: BrandPaletteExtraction }>()

function isRateLimited(svId: string): boolean {
  const now = Date.now()
  const bucket = (rateBuckets.get(svId) ?? []).filter(t => now - t < RATE_WINDOW_MS)
  if (bucket.length >= RATE_MAX) {
    rateBuckets.set(svId, bucket)
    return true
  }
  bucket.push(now)
  rateBuckets.set(svId, bucket)
  return false
}

function getCached(logoUrl: string): BrandPaletteExtraction | null {
  const entry = paletteCache.get(logoUrl)
  if (!entry) return null
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    paletteCache.delete(logoUrl)
    return null
  }
  return entry.result
}

function setCached(logoUrl: string, result: BrandPaletteExtraction): void {
  paletteCache.set(logoUrl, { at: Date.now(), result })
  // Soft-Bound: bei > 500 Einträgen älteste rauswerfen.
  if (paletteCache.size > 500) {
    const oldest = paletteCache.entries().next().value
    if (oldest) paletteCache.delete(oldest[0])
  }
}

// ─── Handler ───────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  // SV-Identität für Rate-Limit-Bucket ermitteln. Fällt zurück auf user.id
  // falls der User noch keinen SV-Row hat (zB Admin der testet).
  const { data: sv } = await supabase
    .from('sachverstaendige')
    .select('id')
    .eq('profile_id', user.id)
    .maybeSingle()
  const bucketKey = sv?.id ?? user.id

  if (isRateLimited(bucketKey)) {
    return NextResponse.json(
      { error: 'Zu viele Anfragen. Bitte warten Sie einen Moment.' },
      { status: 429 },
    )
  }

  let body: { logoUrl?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }
  const logoUrl = typeof body.logoUrl === 'string' ? body.logoUrl.trim() : ''
  if (!logoUrl || !/^https?:\/\//.test(logoUrl)) {
    return NextResponse.json({ error: 'logoUrl muss eine gültige http(s)-URL sein' }, { status: 400 })
  }

  const cached = getCached(logoUrl)
  if (cached) {
    return NextResponse.json({ ...cached, cached: true })
  }

  try {
    const result = await extractBrandPalette(logoUrl)
    setCached(logoUrl, result)
    return NextResponse.json(result)
  } catch (err) {
    console.error('[AAR-420] extractBrandPalette fehlgeschlagen:', err)
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Extraktion fehlgeschlagen' },
      { status: 500 },
    )
  }
}
