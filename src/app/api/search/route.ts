import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { dedupeAndGroup } from '@/lib/search/parse-results'
import { pickSearchRpc } from '@/lib/search/pick-rpc'
import type { SearchHit } from '@/lib/search/types'

// Unified Global-Suche: ruft die passende Such-RPC (SECURITY INVOKER) ueber den User-Client
// -> RLS scoped die Treffer auf das Sichtbare des Users; die Funktion gated die Entitaeten
// zusaetzlich per Rolle. Ausnahme Makler: die haben KEIN claims-RLS -> search_global gaebe
// ihnen 0 Claims + (via leads-RLS) Leads, die routeForEntity nach /dispatch/leads schickt
// (403). Fuer sie laeuft die consent-gegatete DEFINER-RPC search_makler (nur eigene
// konsentierte Faelle, id=fall_id -> /makler/akten). Ersetzt die frueheren ilike-Endpoints
// /api/search (admin) + /api/gutachter/search (SV). Rueckgabe: gruppierte, dedup. Treffer.
export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, groups: [] })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, groups: [] }, { status: 401 })

  const { data: profil } = await supabase.from('profiles').select('rolle').eq('id', user.id).maybeSingle()
  const rpcName = pickSearchRpc((profil as { rolle?: string | null } | null)?.rolle)

  // Cast-Bridge: search_global/search_makler sind frisch (Migrationen 20260714142103 /
  // 20260715005218); database.types.ts hinkt hinterher (Regen = Follow-up) -> RPC ungetypt.
  const { data, error } = await supabase.rpc(
    rpcName as never,
    { q, limit_per_type: 6 } as never,
  )
  if (error) return NextResponse.json({ ok: false, groups: [] }, { status: 200 })

  return NextResponse.json({ ok: true, groups: dedupeAndGroup((data ?? []) as unknown as SearchHit[]) })
}
