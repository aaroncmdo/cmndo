// AAR-388: Batch-Endpoint für GPS-Positionen aus der Offline-Outbox.
// Nimmt bis zu 50 Positionen pro Call, schreibt nach sv_live_position.
// Merge-Regel: je sv_id wird nur die Position mit dem jüngsten captured_at
// als „aktuelle Position" überschrieben. Alle Inserts respektieren
// live_tracking_enabled.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

type PositionInput = {
  idempotency_key: string
  termin_id: string | null
  lat: number
  lng: number
  accuracy_m: number | null
  heading: number | null
  speed_kmh: number | null
  captured_at: string // ISO
}

function isValid(p: unknown): p is PositionInput {
  if (!p || typeof p !== 'object') return false
  const r = p as Record<string, unknown>
  return (
    typeof r.idempotency_key === 'string' &&
    typeof r.lat === 'number' &&
    typeof r.lng === 'number' &&
    typeof r.captured_at === 'string'
  )
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const body = (await req.json().catch(() => null)) as {
      positions?: unknown
    } | null
    if (!body || !Array.isArray(body.positions)) {
      return NextResponse.json({ error: 'invalid_body' }, { status: 400 })
    }

    const positions = body.positions.filter(isValid)
    if (positions.length === 0) {
      return NextResponse.json({ accepted: 0 })
    }
    if (positions.length > 50) {
      return NextResponse.json({ error: 'batch_too_large' }, { status: 413 })
    }

    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('id, live_tracking_enabled')
      .eq('profile_id', user.id)
      .single()

    if (!sv) return NextResponse.json({ error: 'no_sv' }, { status: 403 })
    if (!sv.live_tracking_enabled) {
      return NextResponse.json({ error: 'tracking_disabled' }, { status: 403 })
    }

    // Nach captured_at sortieren — neueste zuletzt, damit updated_at korrekt
    const sorted = [...positions].sort(
      (a, b) =>
        new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime(),
    )

    const rows = sorted.map((p) => ({
      sv_id: sv.id,
      lat: p.lat,
      lng: p.lng,
      accuracy_m: p.accuracy_m,
      heading: p.heading,
      speed_kmh: p.speed_kmh,
      captured_at: p.captured_at,
    }))

    const { error } = await supabase.from('sv_live_position').insert(rows)

    if (error) {
      return NextResponse.json(
        { error: error.message ?? 'insert_failed' },
        { status: 500 },
      )
    }

    return NextResponse.json({ accepted: rows.length })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
