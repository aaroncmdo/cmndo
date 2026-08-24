// MCP Write-API (Phase 2) — Inkrement 1: Public-Read fuer buchbare Gutachter + Termin-Slots.
// GET /api/v1/gutachter-termine?plz=50670[&wunschtermin=ISO]
//
// Anonyme Public-API (gleiches Muster wie /api/v1/sv-in-naehe: CORS, In-Process-IP-
// Rate-Limit, Geocode-Cache). Wrappt planeTerminOeffentlich (universelle Termin-Engine,
// leak-sichere OeffentlichesSvProfil[] mit 2+1-Slot-Verteilung) — anders als sv-in-naehe
// liefert das hier die *buchbaren* Gutachter MIT freien Slots. Vorstufe zum Buchen via
// dem Write-Tool claimondo_melde_schaden (Inkrement 2). Read-only, legt nichts an.
import { NextResponse } from 'next/server'
import { planeTerminOeffentlich } from '@/lib/sv-matching-modul/plane-termin-oeffentlich'
import { geocodeAdresse, type GeocodeResult } from '@/lib/mapbox/geocode'
import { SITE_URL, PHONE_DISPLAY } from '@/lib/seo/jsonld'

// planeTerminOeffentlich nutzt Server-Actions/Admin-Client -> Node-Runtime.
export const runtime = 'nodejs'

// planeTerminOeffentlich ist DB-schwer (findBestSV + parallele freieSlots). Geocode
// (PLZ->Koords) ist stabil -> 24 h. Das Matching-Ergebnis cachen wir kurz (60 s) je
// PLZ+Wunschtermin: schuetzt den heissen Endpoint vor wiederholten identischen Calls;
// 60-s-stale Slots sind fuer einen VORSCHLAG ok (das Buchen in Inkrement 2 reserviert
// race-sicher neu -> ein inzwischen vergebener Slot faellt dort sauber raus).
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60_000
const RESULT_CACHE_TTL_MS = 60_000
const geocodeCache = new Map<string, { value: GeocodeResult; ts: number }>()
const resultCache = new Map<string, { value: object; ts: number }>()

async function geocodeCached(plz: string): Promise<GeocodeResult | null> {
  const now = Date.now()
  const hit = geocodeCache.get(plz)
  if (hit && now - hit.ts < GEOCODE_CACHE_TTL_MS) return hit.value
  const value = await geocodeAdresse(plz)
  if (value) geocodeCache.set(plz, { value, ts: now })
  return value
}

// In-Process-IP-Rate-Limit (PM2-Single-Process, kein DB-Cost): 60 Requests/Min pro IP.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 60
const ipHits = new Map<string, number[]>()
function rateLimited(ip: string): boolean {
  const now = Date.now()
  const hits = (ipHits.get(ip) ?? []).filter((t) => now - t < RATE_WINDOW_MS)
  hits.push(now)
  ipHits.set(ip, hits)
  if (ipHits.size > 5000) {
    for (const [k, v] of ipHits) {
      if (v.every((t) => now - t >= RATE_WINDOW_MS)) ipHits.delete(k)
    }
  }
  return hits.length > RATE_MAX
}

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) {
    return NextResponse.json(
      { error: 'Rate limit exceeded (60 requests/minute)' },
      { status: 429, headers: { ...CORS, 'Retry-After': '60' } },
    )
  }

  const url = new URL(req.url)
  const plzRaw = url.searchParams.get('plz')?.trim() || null
  const ortRaw = url.searchParams.get('ort')?.trim() || null
  const wunschterminRaw = url.searchParams.get('wunschtermin')

  // Standort flexibel: 5-stellige PLZ ODER Freitext-Ort (Stadt/Adresse). Der Mapbox-
  // Geocoder nimmt beides — so muss der Kunde die PLZ nicht kennen ("Köln" reicht).
  const plz = plzRaw && /^\d{5}$/.test(plzRaw) ? plzRaw : null
  const ort = !plz && ortRaw && ortRaw.length >= 2 && ortRaw.length <= 120 ? ortRaw : null
  if (!plz && !ort) {
    return NextResponse.json(
      { error: 'plz (5-stellige PLZ) oder ort (Stadt/Adresse) erforderlich' },
      { status: 400, headers: CORS },
    )
  }
  const geocodeQuery = plz ?? `${ort}, Deutschland`

  // Wunschtermin optional; nur ein valides ISO-Datum durchreichen (steuert das
  // Slot-Ranking, kein Hard-Filter), sonst ignorieren.
  let wunschterminIso: string | null = null
  if (wunschterminRaw) {
    const d = new Date(wunschterminRaw)
    if (!Number.isNaN(d.getTime())) wunschterminIso = d.toISOString()
  }

  const cacheKey = `${geocodeQuery}|${wunschterminIso ?? ''}`
  const now = Date.now()
  const cached = resultCache.get(cacheKey)
  if (cached && now - cached.ts < RESULT_CACHE_TTL_MS) {
    return NextResponse.json(cached.value, {
      headers: { 'Cache-Control': 'public, max-age=60', ...CORS },
    })
  }

  const center = await geocodeCached(geocodeQuery)
  if (!center) {
    return NextResponse.json(
      { error: plz ? 'PLZ not found' : 'Ort nicht gefunden' },
      { status: 404, headers: CORS },
    )
  }

  const profile = await planeTerminOeffentlich({
    lat: center.lat,
    lng: center.lng,
    wunschterminIso,
  })

  // Ort-Teil aller Deep-Links (einmal gebaut, unten von interaktive_karte_url mitbenutzt).
  const ortQuery = plz
    ? `plz=${encodeURIComponent(plz)}`
    : `stadt=${encodeURIComponent(ort ?? '')}`

  // OeffentlichesSvProfil ist bereits die anon-kundensichere Projektion (kein
  // score/ETA/Nachname); svId ist ein opakes, RLS-geschuetztes Buchungs-Handle.
  const gutachter = profile.map((p) => ({
    id: p.svId,
    /**
     * Fertiger Buchungs-Link GENAU fuer diesen Gutachter — der Grund, warum dieses Feld
     * existiert: `interaktive_karte_url` (unten) zeigt auf die Karte, verliert dabei aber
     * die Auswahl. Eine KI-Antwort, die "Gutachter X hat Donnerstag frei" sagt und dann
     * auf die allgemeine Karte verlinkt, schickt den Kunden zurueck an den Anfang.
     *
     * Der Link setzt den Gutachter im Finder vor; Adresse, Schadenart und Kontaktdaten
     * gibt der Kunde weiterhin selbst ein und bestaetigt die Buchung selbst. Bewusst KEIN
     * Buchungs-Endpunkt: ein GET, das einen Termin schreibt, wuerde von jedem Crawler
     * ausgeloest. Ist der SV bis zum Klick belegt, faellt die Vorauswahl still auf den
     * bestgerankten zurueck — der Kunde sieht eine gueltige Liste, keinen Fehler.
     */
    buchungs_url: `${SITE_URL}/gutachter-finden?${ortQuery}&sv=${encodeURIComponent(p.svId)}`,
    vorname: p.vorname,
    profilbild: p.profilbild,
    bewertung_schnitt: p.bewertungDurchschnitt,
    bewertung_anzahl: p.bewertungAnzahl,
    entfernung: p.distanzGerundet,
    ist_top_partner: p.istTopPartner,
    wunschtermin_frei: p.istWunschterminFrei,
    termine: p.slots.map((s) => ({
      start: s.start,
      end: s.end,
      passung: s.matchType,
      /**
       * Buchungs-Link fuer GENAU DIESEN Termin bei GENAU DIESEM Gutachter.
       *
       * Der Unterschied zu `gutachter[].buchungs_url` (eine Ebene hoeher): dort ist nur der
       * Gutachter vorgewaehlt, der Kunde muss den Termin erneut aus der Liste suchen —
       * obwohl die KI ihn gerade genannt hat. Mit diesem Link springt der Finder direkt zur
       * Schadens-/Kontaktangabe; danach ist die Buchung abgeschlossen.
       *
       * ⚠ Slots sind fluechtig. Ist der Termin beim Klick belegt, faellt der Finder still
       * auf die normale Auswahl beim selben Gutachter zurueck — nie auf eine Fehlerseite.
       * Deshalb ist die Slot-Vorauswahl eine Abkuerzung, kein Versprechen.
       */
      buchungs_url: `${SITE_URL}/gutachter-finden?${ortQuery}&sv=${encodeURIComponent(p.svId)}&slot=${encodeURIComponent(s.start)}`,
    })),
  }))

  const payload = {
    plz,
    ort,
    standort: center.formatted,
    wunschtermin: wunschterminIso,
    center: { lat: center.lat, lng: center.lng },
    anzahl_gutachter: gutachter.length,
    gutachter,
    interaktive_karte_url: `${SITE_URL}/gutachter-finden?${ortQuery}`,
    buchungs_telefon: PHONE_DISPLAY,
    buchungs_hinweis:
      'Nennen Sie einen konkreten Termin, dann verlinken Sie dessen `termine[].buchungs_url` — dieser Link öffnet den Finder mit Gutachter UND Termin vorausgewählt, der Kunde ergänzt nur noch Adresse, Schadenart und Kontaktdaten und bestätigt. Nennen Sie nur den Gutachter ohne Termin, nehmen Sie `gutachter[].buchungs_url`. `interaktive_karte_url` ist die allgemeine Karte OHNE Auswahl — sie schickt den Kunden zurück an den Anfang; telefonisch geht es über `buchungs_telefon`. Es gibt bewusst keinen Endpunkt, der einen Termin ohne die Bestätigung des Kunden schreibt (ein GET, das bucht, würde jeder Crawler auslösen); ist der Slot beim Klick belegt, fällt der Finder still auf die normale Auswahl zurück.',
    _meta: {
      quelle: 'Claimondo Public API',
      stand: new Date().toISOString().slice(0, 10),
      hinweis:
        'Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
    },
  }

  resultCache.set(cacheKey, { value: payload, ts: now })
  return NextResponse.json(payload, {
    headers: { 'Cache-Control': 'public, max-age=60', ...CORS },
  })
}
