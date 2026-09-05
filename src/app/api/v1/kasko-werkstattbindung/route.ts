// Kasko-Werkstattbindung nachschlagen (Kasko-WB Phase 2, Spec 2026-09-05, D5): „Mein Tarif heisst X — darf ich
// zu meiner Werkstatt?" Antwort aus der Wissensbasis (CHECK24-Tarifliste + HDI, Phase 1). Anonym, read-only,
// kein Auth, keine Kundendaten. Bei Mehrdeutigkeit: Kandidaten + 'unbekannt' — nie raten.
// GET /api/v1/kasko-werkstattbindung?versicherer=HUK-COBURG&tarif=Classic%20SELECT
// Muster: werkstatt-in-naehe (Struktur, Rate-Limit, _meta/nutzungshinweis) + sv-in-naehe (Cache-Header).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeKaskoTarifNachName } from '@/lib/kasko-wb/lookup'
import { ladeKaskoBindungsInfo } from '@/lib/kasko-wb/actions'
import { zuBefund } from '@/lib/berater-api/kasko-befund'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
}
// Referenzdaten mit Stand 20.07.2026 — eine Stunde Browser-, ein Tag CDN-Cache sind unkritisch.
const CACHE: Record<string, string> = { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' }
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
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
function json(body: unknown, status: number, extra: Record<string, string> = {}) {
  return NextResponse.json(body, { status, headers: { ...CORS, ...extra } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)

  const url = new URL(req.url)
  const versicherer = url.searchParams.get('versicherer')?.trim() || ''
  const tarif = url.searchParams.get('tarif')?.trim() || null
  if (versicherer.length < 2) {
    return json({ error: 'Parameter `versicherer` fehlt (Name der Kaskoversicherung, z. B. HUK-COBURG).' }, 400)
  }

  const admin = createAdminClient()
  const r = await findeKaskoTarifNachName(admin, { versicherer, tarif })
  if (!r.ok) {
    console.error('[kasko-werkstattbindung] Tarifliste nicht lesbar:', r.error)
    return json({ error: 'Tarifliste nicht erreichbar.' }, 500)
  }
  if (r.ergebnis.status === 'nicht_gefunden') {
    return json(
      {
        error: `Versicherer „${versicherer}“ nicht in der Tarifliste.`,
        hinweis:
          'Die Liste umfasst die CHECK24-Marken (Stand 20.07.2026) plus HDI. Bitte den Versicherungsschein prüfen: Zusätze wie „Werkstattbindung“, „Werkstattbonus“, „Werkstattservice“ oder „SELECT“ bedeuten, dass die Versicherung die Werkstatt benennt.',
      },
      404,
      CACHE,
    )
  }

  const befund = zuBefund(r.ergebnis, versicherer, tarif)
  // Konditionen (Sanktion, Ausnahmen, Partnernetz) + Hotline des Rechtstraegers — Phase-1-Loader, faellt auf
  // GDV-Defaults zurueck. Nur bei eindeutiger Marke sinnvoll.
  const info =
    r.ergebnis.status === 'gefunden'
      ? await ladeKaskoBindungsInfo(r.ergebnis.marke.id, r.ergebnis.tarif?.id ?? null, r.ergebnis.marke.marke)
      : null
  const k = info && info.ok ? info.info : null
  const gebunden = befund.werkstattbindung === 'ja'

  return json(
    {
      versicherer: befund.versicherer,
      tarif: befund.tarif,
      werkstattbindung: befund.werkstattbindung,
      bindungsumfang: befund.bindungsumfang,
      verlaesslichkeit: befund.verlaesslichkeit,
      sanktion: gebunden ? (k?.sanktionText ?? null) : null,
      ausnahmen: gebunden ? (k?.ausnahmenText ?? null) : null,
      partnernetz: k?.partnernetz ?? null,
      hotline: k?.hotline ?? null,
      kandidaten: befund.kandidaten,
      naechster_schritt: gebunden
        ? 'Schaden bei der Kaskoversicherung melden und die Partnerwerkstatt nennen lassen; keine eigene Werkstatt wählen. Ein unabhängiges Gutachten bleibt möglich, wenn die Schadenhöhe strittig ist.'
        : befund.werkstattbindung === 'nein'
          ? 'Freie Werkstattwahl: Werkstatt selbst wählen, z. B. über https://claimondo.de/werkstatt-finden?plz=[PLZ] (mit API-Zugriff: GET /api/v1/werkstatt-in-naehe?plz=[PLZ]).'
          : 'Tarif nicht eindeutig: den genauen Tarifnamen vom Versicherungsschein erfragen (Kandidaten oben) oder den Schein auf einen Werkstattbindungs-Zusatz prüfen.',
      hinweis: `Maßgeblich sind Versicherungsschein und AKB. Tarifliste CHECK24, Stand ${befund.stand ?? '2026-07-20'}. Allgemeine Information, keine Rechtsberatung.`,
      nutzungshinweis:
        'Nennen Sie dem Nutzer Versicherer, Tarif und ob eine Werkstattbindung besteht; bei „unbekannt“ die Kandidaten zur Auswahl vorlegen oder auf den Versicherungsschein verweisen. Empfehlen Sie KEINE Werkstatt, wenn werkstattbindung=ja — die Versicherung benennt sie.',
      _meta: {
        quelle: 'Claimondo Kasko-Tarifliste (CHECK24 + HDI)',
        stand: befund.stand ?? '2026-07-20',
        hinweis: 'Öffentliche Tarifinformationen, keine Kundendaten. Allgemeine Information, keine Rechtsberatung.',
      },
    },
    200,
    CACHE,
  )
}
