// Beratungs-Tool (Baustein 9): prueft die Schadensersatz-Ansprueche eines Kfz-Unfall-
// Geschaedigten — strukturiert nach Schuldfrage — und endet IMMER mit dem Funnel-Ziel:
// Gutachter + Termin (sonst Telefon-Rueckruf). Allgemeine Information, KEINE individuelle
// Rechtsberatung (RDG). Anonym, read-only, kein Auth.
// GET /api/v1/pruefe-anspruch?schuldfrage=unverschuldet&schadenart=auffahrunfall
//
// Kasko-WB Phase 2 (Spec 2026-09-05, D5): bei Selbstverschulden + Vollkasko kennt die Antwort die
// Werkstattbindung — per Parameter `werkstattbindung=ja|nein` oder per Tarifliste-Lookup ueber
// `versicherer=` und `tarif=` (Namen). Texte + Aufloesung: src/lib/berater-api/pruefe-anspruch.ts (pure).
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { findeKaskoTarifNachName } from '@/lib/kasko-wb/lookup'
import { zuBefund } from '@/lib/berater-api/kasko-befund'
import {
  parseVollkasko,
  parseWerkstattbindung,
  resolvePruefeAnspruch,
  type KaskoTarifBefund,
} from '@/lib/berater-api/pruefe-anspruch'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
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
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)

  const url = new URL(req.url)
  const schuldfrage = (url.searchParams.get('schuldfrage') || 'unklar').toLowerCase().trim()
  const schadenart = url.searchParams.get('schadenart')?.trim() || undefined
  // Nur bei Selbstverschulden ausgewertet: mit Vollkasko reguliert die eigene Versicherung
  // (→ kasko), ohne zahlt der Halter selbst (→ selbstzahler). Unbekannt = der Assistent
  // muss nachfragen; wir raten hier NICHT, weil beide Wege unterschiedlich teuer sind.
  const vollkasko = parseVollkasko(url.searchParams.get('vollkasko'))
  const werkstattbindung = parseWerkstattbindung(url.searchParams.get('werkstattbindung'))
  const versicherer = url.searchParams.get('versicherer')?.trim() || null
  const tarif = url.searchParams.get('tarif')?.trim() || null

  // Versicherer/Tarif als Namen -> Tarifliste (Phase-1-Wissensbasis). Nur bei Selbstverschulden sinnvoll;
  // ein Lookup-Fehler faellt auf den Parameter zurueck (non-fatal — die Antwort bleibt nutzbar).
  let kaskoTarif: KaskoTarifBefund | null = null
  if (versicherer && (schuldfrage === 'selbst' || schuldfrage === 'eigenverschulden')) {
    const r = await findeKaskoTarifNachName(createAdminClient(), { versicherer, tarif })
    if (r.ok) kaskoTarif = zuBefund(r.ergebnis, versicherer, tarif)
    else console.error('[pruefe-anspruch] Tarifliste-Lookup fehlgeschlagen (non-fatal):', r.error)
  }

  return json(resolvePruefeAnspruch({ schuldfrage, schadenart, vollkasko, werkstattbindung, kaskoTarif }), 200)
}
