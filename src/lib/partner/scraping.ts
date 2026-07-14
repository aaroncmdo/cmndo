// Partner-Lead-Scraping: findet neue Prospects (SV/Werkstatt/Makler) ueber die
// offizielle Google-Places-API (Text Search + Details) und bildet sie auf
// ScrapeKandidat ab. Legal/ToS-konform (kein HTML-Scraping); reuse des im Projekt
// bereits genutzten GOOGLE_PLACES_API_KEY + maps.googleapis.com/maps/api/place/...
// (siehe api/kfzgutachter-lp/gutachter-verfuegbar).
//
// Die PUREN Funktionen (Suchbegriff, Adress-Parsing, Dedup) sind der getestete Seam;
// scrapeGooglePlaces ist die duenne API-Schale drumherum. Der Server-Action nutzt
// filterGegenBestand fuer die Dubletten-Filterung (Aaron: "keine Dubletten anlegen").

import type { PartnerRolle } from '@/lib/partner/policy'

export type ScrapeKandidat = {
  google_place_id: string
  firma: string
  telefon: string | null
  website: string | null
  strasse: string | null
  plz: string | null
  ort: string | null
  formatted_address: string
}

/** Minimal-Shape eines bestehenden Leads fuer die Dubletten-Pruefung. */
export type BestandsLead = {
  google_place_id: string | null
  firma: string | null
  telefon: string | null
  plz: string | null
}

// ─── Pure: Suchbegriff je Rolle ────────────────────────────────────────────

/** Rollen-spezifischer Google-Places-Suchbegriff (deutsche Branchenbezeichnung). */
export function sucheBegriffFuerRolle(rolle: PartnerRolle): string {
  switch (rolle) {
    case 'sachverstaendiger':
      return 'KFZ-Sachverständiger Kfz-Gutachter'
    case 'werkstatt':
      return 'KFZ-Werkstatt Autowerkstatt'
    case 'makler':
      return 'Versicherungsmakler'
  }
}

// ─── Pure: Normalisierung (fuer Dedup) ─────────────────────────────────────

/** Telefonnummer auf reine Vergleichsziffern reduzieren (+49/0049 → 0). */
export function normalisiereTelefon(tel: string | null | undefined): string {
  if (!tel) return ''
  const kompakt = tel.replace(/[^\d+]/g, '').replace(/^\+49/, '0').replace(/^0049/, '0')
  return kompakt.replace(/\D/g, '')
}

/** Firmenname auf alphanumerischen Kern reduzieren (Case/Satzzeichen-insensitiv). */
export function normalisiereFirma(firma: string | null | undefined): string {
  return (firma ?? '').toLowerCase().replace(/[^a-z0-9äöüß]/g, '')
}

// ─── Pure: deutsche Adresse aus formatted_address parsen ───────────────────

/**
 * Zerlegt eine Google-`formatted_address` (z.B. "Mönckebergstr. 7, 20095 Hamburg,
 * Deutschland") in strasse / plz / ort. Robust gegen fehlende Teile.
 */
export function parseDeutscheAdresse(formatted: string): {
  strasse: string | null
  plz: string | null
  ort: string | null
} {
  const teile = (formatted ?? '')
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
  let plz: string | null = null
  let ort: string | null = null
  const strasseTeile: string[] = []
  for (const teil of teile) {
    if (/^(deutschland|germany)$/i.test(teil)) continue
    const m = teil.match(/^(\d{5})\s+(.+)$/)
    if (m && !plz) {
      plz = m[1]
      ort = m[2].trim()
    } else if (!plz) {
      // alles VOR dem PLZ-Teil = Strasse
      strasseTeile.push(teil)
    }
  }
  return {
    strasse: strasseTeile.length > 0 ? strasseTeile.join(', ') : null,
    plz,
    ort,
  }
}

// ─── Pure: Places-Ergebnis → Kandidat ──────────────────────────────────────

export type PlacesTextResult = { place_id: string; name: string; formatted_address: string }
export type PlacesDetails = { formatted_phone_number?: string; website?: string } | null

export function mapPlaceZuKandidat(result: PlacesTextResult, details: PlacesDetails): ScrapeKandidat {
  const adr = parseDeutscheAdresse(result.formatted_address)
  return {
    google_place_id: result.place_id,
    firma: result.name,
    telefon: details?.formatted_phone_number ?? null,
    website: details?.website ?? null,
    strasse: adr.strasse,
    plz: adr.plz,
    ort: adr.ort,
    formatted_address: result.formatted_address,
  }
}

// ─── Pure: Dedup ───────────────────────────────────────────────────────────

/** Ist der Kandidat eine Dublette eines bestehenden Leads? place_id | Telefon | (Firma+PLZ). */
export function istDublette(
  kandidat: Pick<ScrapeKandidat, 'google_place_id' | 'firma' | 'telefon' | 'plz'>,
  bestehende: BestandsLead[],
): boolean {
  const kTel = normalisiereTelefon(kandidat.telefon)
  const kFirma = normalisiereFirma(kandidat.firma)
  const kPlaceId = kandidat.google_place_id
  return bestehende.some((b) => {
    if (kPlaceId && b.google_place_id && b.google_place_id === kPlaceId) return true
    if (kTel && normalisiereTelefon(b.telefon) === kTel) return true
    if (kFirma && kandidat.plz && b.plz && b.plz === kandidat.plz && normalisiereFirma(b.firma) === kFirma) {
      return true
    }
    return false
  })
}

/** Entfernt Dubletten INNERHALB einer Trefferliste (gleiche place_id/Telefon/Firma). */
export function dedupeInBatch(kandidaten: ScrapeKandidat[]): ScrapeKandidat[] {
  const gesehen = new Set<string>()
  const out: ScrapeKandidat[] = []
  for (const k of kandidaten) {
    const key = k.google_place_id || normalisiereTelefon(k.telefon) || normalisiereFirma(k.firma)
    if (!key || gesehen.has(key)) continue
    gesehen.add(key)
    out.push(k)
  }
  return out
}

/** Teilt Kandidaten in { neu, dubletten } gegen den Bestand (partner_leads). */
export function filterGegenBestand(
  kandidaten: ScrapeKandidat[],
  bestehende: BestandsLead[],
): { neu: ScrapeKandidat[]; dubletten: ScrapeKandidat[] } {
  const neu: ScrapeKandidat[] = []
  const dubletten: ScrapeKandidat[] = []
  for (const k of kandidaten) {
    if (istDublette(k, bestehende)) dubletten.push(k)
    else neu.push(k)
  }
  return { neu, dubletten }
}

// ─── Impure: Google Places API (Text Search + Details) ─────────────────────

const PLACES_TEXTSEARCH = 'https://maps.googleapis.com/maps/api/place/textsearch/json'
const PLACES_DETAILS = 'https://maps.googleapis.com/maps/api/place/details/json'

/**
 * Sucht bis `limit` Prospects (Cap 60) und reichert Telefon/Website an. Reine
 * API-Schale: Suchbegriff/Mapping/Dedup kommen aus den puren Funktionen oben.
 * next_page_token braucht laut Google ~2s bis gueltig → kurze Verzoegerung je Folgeseite.
 */
export async function scrapeGooglePlaces(params: {
  rolle: PartnerRolle
  region: string
  limit: number
}): Promise<{ ok: true; kandidaten: ScrapeKandidat[] } | { ok: false; error: string }> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY
  if (!apiKey) {
    console.error('[scraping] GOOGLE_PLACES_API_KEY fehlt')
    return { ok: false, error: 'Google-Places ist nicht konfiguriert.' }
  }
  const region = params.region.trim()
  if (region.length < 2) return { ok: false, error: 'Bitte eine Region (Stadt oder PLZ) angeben.' }

  const limit = Math.max(1, Math.min(60, Math.floor(params.limit) || 20))
  const query = `${sucheBegriffFuerRolle(params.rolle)} in ${region}`

  // 1) Text Search — paginiert bis limit (max 3 Seiten x 20).
  const results: PlacesTextResult[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 3 && results.length < limit; page++) {
    const url = new URL(PLACES_TEXTSEARCH)
    if (pageToken) {
      // Folgeseite: Token braucht kurze Reifezeit.
      await new Promise((r) => setTimeout(r, 2100))
      url.searchParams.set('pagetoken', pageToken)
    } else {
      url.searchParams.set('query', query)
      url.searchParams.set('language', 'de')
      url.searchParams.set('region', 'de')
    }
    url.searchParams.set('key', apiKey)

    let res: Response
    try {
      res = await fetch(url.toString(), { next: { revalidate: 3600 } })
    } catch (e) {
      console.error('[scraping] textsearch fetch threw:', e)
      return { ok: false, error: 'Google Places ist nicht erreichbar.' }
    }
    if (!res.ok) return { ok: false, error: `Google Places antwortete mit ${res.status}.` }
    const data = (await res.json()) as {
      status?: string
      results?: PlacesTextResult[]
      next_page_token?: string
      error_message?: string
    }
    if (data.status === 'ZERO_RESULTS') break
    if (data.status !== 'OK') {
      console.error('[scraping] textsearch status:', data.status, data.error_message)
      // ERSTE Seite kaputt -> echter Fehler, wir haben nichts.
      // FOLGEseite kaputt -> die bereits geholten Treffer BEHALTEN statt sie wegzuwerfen.
      //
      // Warum das noetig ist: Googles Legacy-Pagination (next_page_token) liefert seit dem
      // Places-Legacy-Sunset zuverlaessig INVALID_REQUEST — auch nach 10s Reifezeit
      // (live gegen die echte API verifiziert 14.07., die 2100ms unten reichen NICHT und
      // laengeres Warten hilft auch nicht). Vorher hat dieser eine kaputte Folge-Call die
      // 20 guten Treffer von Seite 1 verworfen -> JEDE stadtweite Suche schlug fehl und es
      // wurde nie ein Lead importiert (prod: 0 Leads mit source_channel='scraping').
      //
      // Folge: pro Suche gibt es aktuell max. 1 Seite (~20 Treffer). Mehr braucht die
      // NEUE Places API (places.googleapis.com/v1) — die ist fuer unseren Key noch nicht
      // freigeschaltet (PERMISSION_DENIED, verifiziert). -> Aaron/Google-Cloud.
      if (results.length === 0) {
        return { ok: false, error: `Google Places: ${data.status ?? 'Fehler'}.` }
      }
      break
    }
    results.push(...(data.results ?? []))
    if (!data.next_page_token) break
    pageToken = data.next_page_token
  }

  const zuVerarbeiten = results.slice(0, limit)
  if (zuVerarbeiten.length === 0) return { ok: true, kandidaten: [] }

  // 2) Details je Treffer (parallel) — Telefon/Website.
  const details = await Promise.all(
    zuVerarbeiten.map(async (r): Promise<PlacesDetails> => {
      try {
        const durl = new URL(PLACES_DETAILS)
        durl.searchParams.set('place_id', r.place_id)
        durl.searchParams.set('fields', 'formatted_phone_number,website')
        durl.searchParams.set('language', 'de')
        durl.searchParams.set('key', apiKey)
        const dres = await fetch(durl.toString(), { next: { revalidate: 3600 } })
        if (!dres.ok) return null
        const ddata = (await dres.json()) as {
          status?: string
          result?: { formatted_phone_number?: string; website?: string }
        }
        return ddata.status === 'OK' ? ddata.result ?? null : null
      } catch {
        return null
      }
    }),
  )

  const kandidaten = dedupeInBatch(zuVerarbeiten.map((r, i) => mapPlaceZuKandidat(r, details[i])))
  return { ok: true, kandidaten }
}
