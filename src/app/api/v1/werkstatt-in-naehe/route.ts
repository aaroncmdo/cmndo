// Public JSON-API fuer Partner-Werkstaetten im Umkreis (LLM-/Custom-GPT-Konsum).
// GET /api/v1/werkstatt-in-naehe?plz=50670&radius=30
//
// WARUM DIESER ENDPUNKT: Fuer KI-Assistenten existierten Werkstaetten bisher GAR NICHT —
// die oeffentliche API kannte neun Endpunkte, keinen davon fuer Werkstaetten, und der
// MCP-Server sieben Tools, ebenfalls keins. Damit fehlte der ganze Weg fuer
// **selbstverschuldete** Schaeden: dort gibt es keinen Gegner, gegen den man ein Gutachten
// durchsetzt — der Kunde braucht zuerst eine Werkstatt (Kasko-Regulierung oder KVA als
// Selbstzahler). `pruefe-anspruch` verweist seit derselben Aenderung hierher.
//
// ⚠ PROJEKTION IST SICHERHEITSRELEVANT: `werkstaetten` traegt bank_iban/bank_bic/
// bank_kontoinhaber, provision_betrag_netto, ust_id, notizen und user_id. Diese Route
// liest mit dem Admin-Client und gibt AUSSCHLIESSLICH die unten aufgezaehlten Felder aus.
// Neue Felder nur nach bewusster Pruefung ergaenzen — was hier steht, ist oeffentlich.
//
// ⚠⚠ ANONYMISIERT — UND DAS IST DER GESCHAEFTSKERN, NICHT NUR DATENSCHUTZ.
//
// Die erste Fassung dieser Route gab Firmenname, Telefon und Website aus, begruendet mit
// „Werkstaetten sind Firmen mit oeffentlichem Impressum". Das war ein Fehler: ein
// KI-Assistent haette dann geantwortet „Autohaus Mueller, Tel. 0221-…" — und der Kunde
// haette **direkt dort angerufen**. Kein Lead, keine Vermittlung, keine Betreuung, keine
// Provision. Genau deshalb ist der SV-Kanal seit jeher anonym (`vorname_initiale` + Stadt,
// s. gutachter-finder-actions.ts: „Stadt ist anonym genug, Koeln hat 200+ Gutachter").
//
// Die Regel dahinter: **Diese API ist die AKQUISE-Schicht, nicht die Conversion-Schicht.**
// Sie beantwortet „gibt es hier Partner und lohnt der Weg?" — die konkrete Zuordnung
// passiert im Finder, wo der Lead entsteht. Der Finder selbst darf Namen zeigen; dort ist
// der Kunde bereits bei uns.
//
// Konkret NICHT ausgegeben: name, telefon, website, adresse_strasse. Wer das wieder
// aufnimmt, oeffnet den Umgehungsweg erneut.
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodeAdresse, type GeocodeResult } from '@/lib/mapbox/geocode'
import { haversineKm } from '@/lib/geo/distance'
import { SITE_URL, PHONE_DISPLAY } from '@/lib/seo/jsonld'

export const runtime = 'nodejs'

const RADIUS_DEFAULT = 30
const RADIUS_MAX = 200
const MAX_RESULTS = 25

const WERKSTATT_CACHE_TTL_MS = 5 * 60_000
const GEOCODE_CACHE_TTL_MS = 24 * 60 * 60_000

type WerkstattRow = {
  id: string
  // name / telefon / website / adresse_strasse werden BEWUSST nicht geladen — was nicht
  // im Speicher liegt, kann auch nicht versehentlich in die Antwort rutschen.
  adresse_plz: string | null
  adresse_ort: string | null
  lat: number | null
  lng: number | null
  marken: string[] | null
  faehigkeiten: string[] | null
  fahrzeug_gruppen: string[] | null
  ist_freie_werkstatt: boolean | null
  google_rating: number | null
  google_review_count: number | null
  partner: boolean | null
  verifiziert: boolean | null
}

let cache: { rows: WerkstattRow[]; ts: number } | null = null
const geocodeCache = new Map<string, { value: GeocodeResult; ts: number }>()

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

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: CORS })
}

async function ladeWerkstaettenCached(): Promise<WerkstattRow[]> {
  const now = Date.now()
  if (cache && now - cache.ts < WERKSTATT_CACHE_TTL_MS) return cache.rows
  const db = createAdminClient()
  // EIN durchgehendes String-Literal (supabase-js leitet die Typen daraus zur Compile-Zeit
  // ab; ein `+`-Concat macht daraus `GenericStringError`). Bank-/Provisions-/Notiz-Spalten
  // sind hier BEWUSST nicht enthalten — siehe Kopfkommentar.
  const { data, error } = await db
    .from('werkstaetten')
    .select('id, adresse_plz, adresse_ort, lat, lng, marken, faehigkeiten, fahrzeug_gruppen, ist_freie_werkstatt, google_rating, google_review_count, partner, verifiziert')
    .eq('status', 'aktiv')
    .not('lat', 'is', null)
    .not('lng', 'is', null)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as WerkstattRow[]
  // Nur cachen, wenn der Read ok war — sonst friert ein transienter DB-Fehler eine leere
  // Liste fuer 5 Minuten ein und die API meldet „keine Werkstaetten", wo welche sind.
  cache = { rows, ts: now }
  return rows
}

async function geocodeCached(query: string): Promise<GeocodeResult | null> {
  const key = query.toLowerCase()
  const hit = geocodeCache.get(key)
  if (hit && Date.now() - hit.ts < GEOCODE_CACHE_TTL_MS) return hit.value
  const value = await geocodeAdresse(query)
  if (value) geocodeCache.set(key, { value, ts: Date.now() })
  return value
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  if (rateLimited(ip)) return json({ error: 'Rate limit exceeded (60 requests/minute)' }, 429)

  const url = new URL(req.url)
  const plz = url.searchParams.get('plz')?.trim() || null
  const ort = url.searchParams.get('ort')?.trim() || null
  const radiusRoh = Number(url.searchParams.get('radius') ?? RADIUS_DEFAULT)
  const radius = Number.isFinite(radiusRoh) ? Math.min(Math.max(radiusRoh, 1), RADIUS_MAX) : RADIUS_DEFAULT

  if (!plz && !ort) {
    return json({ error: 'Parameter plz oder ort erforderlich, z. B. ?plz=50670' }, 400)
  }

  const center = await geocodeCached(plz ?? ort ?? '')
  if (!center) return json({ error: plz ? 'PLZ not found' : 'Ort nicht gefunden' }, 404)

  let rows: WerkstattRow[]
  try {
    rows = await ladeWerkstaettenCached()
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : 'Datenbankfehler' }, 500)
  }

  const ortQuery = plz ? `plz=${encodeURIComponent(plz)}` : `stadt=${encodeURIComponent(ort ?? '')}`

  const treffer = rows
    .map((w) => ({ w, km: haversineKm(center.lat, center.lng, w.lat as number, w.lng as number) }))
    .filter((x) => x.km <= radius)
    .sort((a, b) => a.km - b.km)
    .slice(0, MAX_RESULTS)
    .map(({ w, km }) => ({
      // Opakes Handle — dient der Zuordnung im Finder, nicht der Direktkontaktaufnahme.
      id: w.id,
      // Anonymisiert: KEIN Firmenname, KEIN Telefon, KEINE Website, KEINE Strasse.
      // Der Ort allein ist unspezifisch genug (eine Grossstadt hat dutzende Werkstaetten)
      // und beantwortet trotzdem die Frage „ist jemand in meiner Naehe?".
      typ: w.ist_freie_werkstatt === false ? 'Markenwerkstatt' : 'Freie Fachwerkstatt',
      ort: w.adresse_ort,
      plz: w.adresse_plz,
      entfernung: `ca. ${Math.round(km)} km`,
      entfernung_km: Math.round(km * 10) / 10,
      ist_freie_werkstatt: w.ist_freie_werkstatt ?? null,
      marken: w.marken ?? [],
      faehigkeiten: w.faehigkeiten ?? [],
      fahrzeug_gruppen: w.fahrzeug_gruppen ?? [],
      bewertung_schnitt: w.google_rating,
      bewertung_anzahl: w.google_review_count,
      ist_partner: w.partner ?? false,
      verifiziert: w.verifiziert ?? false,
      // Der Finder traegt die PLZ; eine Vorauswahl EINER Werkstatt kennt der
      // Werkstatt-Wizard (Standort → Fahrzeug → Schaden → Abrechnung) noch nicht —
      // anders als der Gutachter-Finder, der `?sv=` als Vorauswahl versteht.
      finder_url: `${SITE_URL}/werkstatt-finden?${ortQuery}`,
    }))

  return json({
    plz,
    ort: center.formatted ?? ort,
    radius_km: radius,
    center: { lat: center.lat, lng: center.lng },
    anzahl_treffer: treffer.length,
    werkstaetten: treffer,
    werkstatt_finder_url: `${SITE_URL}/werkstatt-finden?${ortQuery}`,
    buchungs_telefon: PHONE_DISPLAY,
    hinweis:
      treffer.length === 0
        ? 'Keine Partner-Werkstatt im angegebenen Umkreis. Über den Werkstatt-Finder oder den Telefon-Rückruf lässt sich trotzdem eine Werkstatt vermitteln.'
        : 'Werkstatt-Weg: bei SELBST verschuldetem Schaden der erste Schritt (Vollkasko reguliert abzüglich Selbstbeteiligung, ohne Kasko zahlt der Halter selbst — dann Kostenvoranschlag einholen). Bei UNVERSCHULDETEM Schaden zuerst den unabhängigen Gutachter beauftragen (GET /api/v1/gutachter-termine?plz=…), die Werkstatt folgt danach; die Kosten trägt dort der gegnerische Haftpflichtversicherer nach § 249 BGB.',
    nutzungshinweis:
      'Diese Liste enthält bewusst KEINE Firmennamen, Telefonnummern oder Adressen — sie beantwortet nur, OB und WIE VIELE Partner-Werkstätten in der Nähe sind. Nennen Sie dem Nutzer die Anzahl, die Entfernung und die Art (freie Fachwerkstatt / Markenwerkstatt) und verlinken Sie dann `werkstatt_finder_url`. Dort erfolgt die konkrete Zuordnung inklusive Terminabstimmung, Abrechnung mit der Versicherung und Betreuung — erfinden Sie keine Werkstattnamen und raten Sie keine Kontaktdaten.',
    _meta: {
      quelle: 'Claimondo Public API',
      stand: new Date().toISOString().slice(0, 10),
      hinweis:
        'Partner-Werkstätten von Claimondo. Namen sind öffentlich (Firmen mit Impressum). Allgemeine Information, keine Rechtsberatung.',
    },
  })
}
