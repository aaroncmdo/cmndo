import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dedupeAndGroup } from '@/lib/search/parse-results'
import type { SearchHit } from '@/lib/search/types'

// Unified Global-Suche: ruft den search_global-RPC (SECURITY INVOKER) ueber den User-Client
// -> RLS scoped die Treffer auf das Sichtbare des Users; die Funktion gated die Entitaeten
// zusaetzlich per Rolle. Ersetzt die frueheren ilike-Endpoints /api/search (admin) +
// /api/gutachter/search (SV). Rueckgabe: gruppierte, per Claim-id deduplizierte Treffer.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, groups: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, groups: [] }, { status: 401 })

  // Cast-Bridge: search_global ist frisch (Migration 20260714142103); database.types.ts
  // hinkt hinterher (Regen = Follow-up) -> RPC-Name/Args ungetypt.
  const { data, error } = await supabase.rpc(
    'search_global' as never,
    { q, limit_per_type: 6 } as never,
  )
  if (error) return NextResponse.json({ ok: false, groups: [] }, { status: 200 })

  return NextResponse.json({ ok: true, groups: dedupeAndGroup((data ?? []) as unknown as SearchHit[]) })
}
