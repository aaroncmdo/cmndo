import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sucheVerzeichnis } from '@/lib/netzwerk/verzeichnis'
import type { NetzwerkRolle } from '@/lib/netzwerk/types'

// Duenner Wrapper um sucheVerzeichnis() fuer VerzeichnisSuche (Client): die Query selbst ist
// kein 'use server' + nutzt den RLS-Client (next/headers) -> nicht client-importierbar.
// Muster: src/app/api/search/route.ts.
const ZIEL_ROLLEN: NetzwerkRolle[] = ['sachverstaendiger', 'werkstatt', 'flottenmanager', 'makler']

export async function GET(req: Request) {
  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ ok: true, treffer: [] })

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, treffer: [] }, { status: 401 })

  const zielRolleRaw = url.searchParams.get('zielRolle')
  const zielRolle = ZIEL_ROLLEN.includes(zielRolleRaw as NetzwerkRolle)
    ? (zielRolleRaw as NetzwerkRolle)
    : undefined

  const treffer = await sucheVerzeichnis(q, zielRolle)
  return NextResponse.json({ ok: true, treffer })
}
