import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

// KFZ-179 / Task #3: Token-gates Status-Poll fuer die anon Tracking-Seite
// (/kunde/termin/[token]). Der anon-Magic-Link-Empfaenger kann gutachter_termine
// NICHT selbst lesen (PII-Haertung der Grant-Lane, 5f603aa7) — der Realtime-Leg im
// Client ist deshalb session-gated (#4543). Damit der anon-Kunde den Live-Status
// trotzdem OHNE Reload sieht, liefert dieser Endpoint (Admin-Client server-seitig,
// per Token autorisiert wie die Page selbst) NUR die Status-Timestamps.
//
// Bewusst KEIN token-scoped anon-RLS auf gutachter_termine (das wuerde die PII-
// Haertung wieder aufreissen + den anon-reachability-Ratchet triggern — die Tabelle
// traegt besichtigungsort_adresse). Der Poll liest die DB-Wahrheit unabhaengig davon,
// welcher Pfad besichtigung_gestartet_am gesetzt hat (SV-Aktion ODER Feldmodus-
// Zeit-Fallback). Kein PII im Payload.
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ error: 'token fehlt' }, { status: 400 })

  const db = createAdminClient()
  const { data: termin } = await db
    .from('gutachter_termine')
    .select('losgefahren_am, ankunft_zeit, besichtigung_gestartet_am')
    .eq('kunden_tracking_token', token)
    .maybeSingle()

  if (!termin) return NextResponse.json({ error: 'nicht gefunden' }, { status: 404 })

  return NextResponse.json(
    {
      losgefahren: !!termin.losgefahren_am,
      angekommen: !!termin.ankunft_zeit,
      besichtigungGestartet: !!termin.besichtigung_gestartet_am,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
