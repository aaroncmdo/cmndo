// AAR-194: CarQuery-Proxy für Modelle einer Marke (optional nach Baujahr).

import { NextRequest, NextResponse } from 'next/server'

export const revalidate = 86400

export async function GET(req: NextRequest) {
  const make = req.nextUrl.searchParams.get('make')
  const year = req.nextUrl.searchParams.get('year')
  if (!make) {
    return NextResponse.json({ models: [], error: 'make parameter required' }, { status: 400 })
  }
  const base = `https://www.carqueryapi.com/api/0.3/?cmd=getModels&make=${encodeURIComponent(make)}`
  const url = year ? `${base}&year=${encodeURIComponent(year)}` : base
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'claimondo/1.0' },
      next: { revalidate: 86400 },
    })
    if (!resp.ok) {
      return NextResponse.json({ models: [], error: `Upstream ${resp.status}` }, { status: 502 })
    }
    const data = await resp.json()
    // CarQuery liefert { Models: [{ model_name, model_make_id }] }
    const modelsRaw = (data.Models ?? []).map((m: { model_name?: string }) => m.model_name ?? '').filter(Boolean)
    // Duplikate raus (API liefert oft Modell-Varianten mehrfach)
    const models = Array.from(new Set<string>(modelsRaw)).sort((a, b) => a.localeCompare(b, 'de'))
    return NextResponse.json({ models })
  } catch (err) {
    return NextResponse.json(
      { models: [], error: err instanceof Error ? err.message : 'Fetch failed' },
      { status: 502 },
    )
  }
}
