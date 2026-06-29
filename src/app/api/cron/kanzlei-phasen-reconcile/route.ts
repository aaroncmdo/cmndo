import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkFallAutoPhase } from '@/lib/autoPhase'

export const dynamic = 'force-dynamic'

/**
 * Kanzlei/Operative-Phasen-Reconciler (Konsistenz-Loop, 29.06.).
 *
 * Laeuft checkFallAutoPhase fuer alle aktiven Faelle -> leitet operative_status aus den Fakten
 * neu ab (self-healing) + synct die Kanzlei-Daten-Tasks. Faengt Drift ab, der den normalen
 * Schreibpfad umging (direkter DB-Edit, Bug, ein Signal das ohne Trigger kam). Idempotent:
 * fuer konsistente Faelle ein No-op. Macht das abgeleitet+gecachte Modell „kugelsicher".
 *
 * Auth: Authorization: Bearer ${CRON_SECRET}. Schedule: VPS-Crontab (Aaron) — z.B. stuendlich
 * (`0 * * * * curl -s -H "Authorization: Bearer $CRON_SECRET" .../api/cron/kanzlei-phasen-reconcile`).
 */
export async function GET(request: Request) {
  if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = createAdminClient()

  // Aktive Faelle ueber die Bridge (fall_id + claim.operative_status). checkFallAutoPhase
  // nimmt fall_id; die Bridge ist der fall_id<->claim_id-Anker (alle Claims haben eine Row).
  const { data: rows, error } = await db
    .from('faelle_claim_bridge')
    .select('fall_id, claims:claim_id!inner(id, operative_status)')

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 })

  type ClaimRel = { id: string; operative_status: string | null }
  type Row = { fall_id: string | null; claims: ClaimRel | ClaimRel[] | null }
  const TERMINAL = new Set(['abgeschlossen', 'storniert'])

  let geprueft = 0
  let korrigiert = 0
  const korrekturen: Array<{ fall_id: string; von: string | null; nach: string | null }> = []

  for (const r of (rows ?? []) as Row[]) {
    const fallId = r.fall_id
    const claim = Array.isArray(r.claims) ? r.claims[0] : r.claims
    if (!fallId || !claim) continue
    const von = claim.operative_status
    if (von && TERMINAL.has(von)) continue

    geprueft++
    try {
      await checkFallAutoPhase(fallId)
    } catch {
      continue
    }

    const { data: after } = await db
      .from('claims')
      .select('operative_status')
      .eq('id', claim.id)
      .maybeSingle()
    const nach = (after?.operative_status as string | null) ?? null
    if (nach !== von) {
      korrigiert++
      korrekturen.push({ fall_id: fallId, von, nach })
    }
  }

  if (korrigiert > 0) {
    console.warn(`[kanzlei-reconcile] Drift korrigiert: ${korrigiert}/${geprueft}`, korrekturen)
  }
  return NextResponse.json({ ok: true, geprueft, korrigiert, korrekturen })
}
