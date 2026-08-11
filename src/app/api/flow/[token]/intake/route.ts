// KI-Intake-Turn: Kundennachricht -> Claude-Extraktion -> nur Schema-Felder
// persistieren (speichereFeststellungFlow) -> naechste Frage. Token-autorisiert.
import { NextResponse } from 'next/server'
import { resolveFlowLeadId } from '@/lib/flow/flow-token'
import { ladeFeststellungIntakeSchema } from '@/lib/self-service/feststellung-intake-schema'
import { resolveBrandingFromFlowToken } from '@/lib/branding/token-theme'
import { extractIntakeTurn, type IntakeTurn } from '@/lib/ai/flow-intake/extract'
import { filterDeltas, fehlendePflicht } from '@/lib/ai/flow-intake/guard'
import { speichereFeststellungFlow } from '@/app/flow/[token]/self-service-feststellung-actions'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Einfacher In-Memory-Turn-Cap pro Token (ein Turn = ein Claude-Call).
const turns = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX = 20
function turnCapped(token: string): boolean {
  const now = Date.now()
  const hits = (turns.get(token) ?? []).filter((t) => now - t < WINDOW_MS)
  hits.push(now)
  turns.set(token, hits)
  return hits.length > MAX
}

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  let body: { nachricht?: string; historie?: IntakeTurn[] }
  try {
    body = (await req.json()) as { nachricht?: string; historie?: IntakeTurn[] }
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }
  const nachricht = (body.nachricht ?? '').trim()
  if (!nachricht) return NextResponse.json({ ok: false, error: 'nachricht_fehlt' }, { status: 400 })
  if (turnCapped(token)) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const { admin, leadId, error } = await resolveFlowLeadId(token)
  if (!admin || !leadId) {
    return NextResponse.json({ ok: false, error: error ?? 'ungueltig' }, { status: 403 })
  }

  const schema = await ladeFeststellungIntakeSchema()

  // Bekannte Werte: die Schema-Spalten vom Lead lesen -> feld_key-Map.
  const spalten = schema.map((f) => f.spalte)
  const { data: leadRow } = await admin
    .from('leads')
    .select(spalten.join(', '))
    .eq('id', leadId)
    .maybeSingle()
  const bekannt: Record<string, unknown> = {}
  for (const f of schema) {
    bekannt[f.feld_key] = (leadRow as Record<string, unknown> | null)?.[f.spalte] ?? null
  }

  const branding = await resolveBrandingFromFlowToken(token)
  const turn = await extractIntakeTurn({
    firmenname: branding.firmenname,
    schema,
    bekannt,
    historie: Array.isArray(body.historie) ? body.historie.slice(-12) : [],
    nachricht,
  })
  if (!turn.ok) return NextResponse.json({ ok: false, error: turn.error }, { status: 502 })

  const sauber = filterDeltas(turn.deltas, schema)
  if (Object.keys(sauber).length > 0) {
    const saved = await speichereFeststellungFlow(token, sauber)
    if (!saved.ok) {
      return NextResponse.json({ ok: false, error: saved.error ?? 'save_failed' }, { status: 500 })
    }
  }

  const fehlend = fehlendePflicht(schema, { ...bekannt, ...sauber })
  return NextResponse.json({
    ok: true,
    naechste_frage: turn.naechste_frage,
    fertig: turn.fertig && fehlend.length === 0,
    fehlend,
  })
}
