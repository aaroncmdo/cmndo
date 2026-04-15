// AAR-194: CarQuery-Proxy für Marken — CORS-Schutz + Caching.
// CarQuery-Free-Tier hat kein CORS-Whitelisting, daher Proxy über Next-API.
// Response cached für 24h damit wir nicht bei jedem Phase-4-Open neu fetchen.

import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 86400 // 24h ISR-Cache

export async function GET(req: NextRequest) {
  const year = req.nextUrl.searchParams.get('year')
  const url = year
    ? `https://www.carqueryapi.com/api/0.3/?cmd=getMakes&year=${encodeURIComponent(year)}`
    : 'https://www.carqueryapi.com/api/0.3/?cmd=getMakes'
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'claimondo/1.0' },
      next: { revalidate: 86400 },
    })
    if (!resp.ok) {
      return NextResponse.json({ makes: [], error: `Upstream ${resp.status}` }, { status: 502 })
    }
    const data = await resp.json()
    // CarQuery liefert { Makes: [{ make_id, make_display, make_country }] }
    const makes = (data.Makes ?? []).map((m: { make_display?: string; make_id?: string }) =>
      m.make_display ?? m.make_id ?? ''
    ).filter(Boolean)
    return NextResponse.json({ makes })
  } catch (err) {
    return NextResponse.json(
      { makes: [], error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 502 },
    )
  }
}
