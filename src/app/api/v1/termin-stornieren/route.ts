// MCP/API — laufenden Termin per FlowLink-Token absagen.
// POST /api/v1/termin-stornieren  { token, grund? }
//
// Warum diese Route existiert: ein Kunde, der seinen Termin nicht wahrnehmen kann, sagt das
// heute entweder im Portal ab (Login noetig) oder er meldet sich gar nicht. Ein KI-Assistent
// ist fuer ihn der kuerzeste Weg — und wenn wir ihn nicht anbieten, ruft er den Gutachter
// direkt an. Dann verlaesst der Vorgang unser System.
//
// Autorisierung = das Token selbst (wie /api/v1/case-status/{token}): der Kunde uebergibt die
// Referenz aus SEINEM Claimondo-Link (per WhatsApp erhalten). Das Write-Design gibt Tokens
// bewusst NICHT in den Chat zurueck — der Kunde muss es also selbst nennen. Wer das Token hat,
// hat ohnehin Zugriff auf den gesamten Vorgang (/flow/[token]) — diese Route eroeffnet also
// keine neue Angriffsflaeche, sie nutzt die bestehende Vertrauensgrenze.
//
// Antwort ist PII-frei: kein Name, kein SV, keine Adresse — nur ob es geklappt hat und wann
// der Termin war. Invalid/unbekannt -> EIN generisches 404 (keine Enumeration).
//
// Die Wirkung (Status, Dispatch-Task, Timeline, Kalender-Cleanup) liegt geteilt in
// `lib/termine/storno-kunde.ts` — dieselbe Funktion, die die Portal-Route fuehrt.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeTerminFuerLead } from '@/lib/termine/finde-termin-fuer-lead'
import { bezugOrExpr } from '@/lib/termine/bezug-filter'
import { storniereTerminAlsKunde } from '@/lib/termine/storno-kunde'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Write-Rate-Limit wie melde-schaden (10/min/IP): ein Storno aendert einen Termin und
// erzeugt einen Dispatch-Task.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10
const ipHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  ipHits.set(ip, hits)
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k)
  }
  return hits.length > RATE_MAX
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

// FlowLink-Token: opak, url-safe. Format-Guard vor dem DB-Hit.
const TOKEN_RE = /^[A-Za-z0-9_-]{8,128}$/

const StornoSchema = z.object({
  token: z.string().trim().max(128),
  grund: z.string().trim().max(500).optional(),
})

const AKTIV_STATUS = ['reserviert', 'bestaetigt']

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return json({ ok: false, error: 'Rate limit exceeded (10 requests/minute)' }, 429)
  }

  const raw = await req.json().catch(() => null)
  const parsed = StornoSchema.safeParse(raw)
  if (!parsed.success) {
    return json({ ok: false, error: 'token ist Pflicht (Referenz aus Ihrem Claimondo-Link).' }, 400)
  }
  const { token, grund } = parsed.data

  // EIN generisches 404 fuer ALLE "kein stornierbarer Termin"-Faelle (Format, unbekanntes
  // Token, kein Termin) -> keine Enumeration, kein Signal ob ein Token existiert.
  const notFound = () =>
    json(
      {
        ok: false,
        error: 'not_found',
        hinweis:
          'Kein laufender Termin zu dieser Referenz gefunden. Bitte prüfen Sie die Referenz aus Ihrem persönlichen Claimondo-Link (per WhatsApp erhalten).',
      },
      404,
    )

  if (!TOKEN_RE.test(token)) return notFound()

  const admin = createAdminClient()

  const { data: fl } = await admin.from('flow_links').select('lead_id').eq('token', token).maybeSingle()
  const leadId = (fl?.lead_id as string | null) ?? null
  if (!leadId) return notFound()

  // Der Termin haengt je nach Fortschritt am LEAD (vor der Fall-Anlage) oder am CLAIM
  // (danach). Beide Achsen pruefen — sonst findet der Storno genau die Termine nicht, die
  // schon zu einem Fall geworden sind, also die naeher am Besichtigungstag liegen.
  let terminId = (await findeTerminFuerLead(admin, leadId))?.id ?? null

  if (!terminId) {
    const { data: claimRows } = await admin.from('claims').select('id').eq('lead_id', leadId).limit(1)
    const claimId =
      Array.isArray(claimRows) && claimRows.length > 0 ? ((claimRows[0] as { id: string }).id ?? null) : null
    if (claimId) {
      // bezugOrExpr deckt Legacy- (fall_id/claim_id) UND bezug-native Termine ab.
      const { data: terminRows } = await admin
        .from('gutachter_termine')
        .select('id, start_zeit')
        .or(bezugOrExpr('fall', claimId))
        .in('status', AKTIV_STATUS)
        .order('start_zeit', { ascending: false })
        .limit(1)
      terminId =
        Array.isArray(terminRows) && terminRows.length > 0 ? ((terminRows[0] as { id: string }).id ?? null) : null
    }
  }

  if (!terminId) return notFound()

  const res = await storniereTerminAlsKunde(admin, {
    terminId,
    grund: grund ?? null,
    quelle: 'assistent',
    // Kein eingeloggter User auf diesem Weg — Task/Timeline tragen keinen Urheber.
    erstelltVonId: null,
  })

  if (!res.ok) {
    if (res.code === 'db_fehler') {
      console.error('[v1/termin-stornieren] Storno fehlgeschlagen:', res.error)
      return json({ ok: false, error: 'Storno fehlgeschlagen. Bitte melden Sie sich direkt bei Claimondo.' }, 500)
    }
    return notFound()
  }

  return json(
    {
      ok: true,
      storniert: !res.bereitsStorniert,
      war_geplant: res.startZeit,
      hinweis: res.bereitsStorniert
        ? 'Dieser Termin war bereits abgesagt — es wurde nichts erneut geändert.'
        : 'Termin abgesagt. Claimondo meldet sich für einen Ersatztermin; einen neuen Termin können Sie jederzeit über Ihren persönlichen Claimondo-Link wählen.',
    },
    200,
  )
}
