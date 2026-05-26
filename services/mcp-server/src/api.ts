// API client for Claimondo's public read API.
//
// Wraps GET /api/v1/sv-in-naehe (anonymous, no auth, IP-rate-limited 60/min) —
// the route lives in the main app at src/app/api/v1/sv-in-naehe/route.ts and is
// live on prod. This client is read-only and never sends user data.

export const DEFAULT_API_BASE = 'https://claimondo.de'
const REQUEST_TIMEOUT_MS = 15_000

/** A single, privacy-anonymised match. tier 1 = profile partner, tier 3 = location pin only. */
// `type` (not `interface`): the SDK's structuredContent target is an index-signature
// type ({ [x: string]: unknown }), to which interfaces are not assignable — only type aliases.
export type SvTreffer = {
  tier: number
  stadt: string | null
  entfernung_km: number
  spezialisierungen: string[]
  bewertung_schnitt: number | null
  bewertung_anzahl: number | null
}

/** Normalised result returned by {@link fetchSvInNaehe}. Mirrors the tool's outputSchema. */
export type SvInNaeheResult = {
  plz: string
  radius_km: number
  anzahl_treffer: number
  sachverstaendige: SvTreffer[]
  karte_url: string
  interaktive_karte_url: string
  buchungs_telefon: string
}

interface RawTreffer {
  tier?: number
  stadt?: string | null
  entfernung_km?: number
  spezialisierungen?: string[]
  bewertung_schnitt?: number | null
  bewertung_anzahl?: number | null
}

interface RawResponse {
  plz?: string
  radius_km?: number
  anzahl_treffer?: number
  sv_liste?: RawTreffer[]
  karte_url?: string
  interaktive_karte_url?: string
  buchungs_telefon?: string
  error?: string
}

/** Thrown for non-2xx responses, network errors and timeouts. Message is user-facing (German). */
export class ClaimondoApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ClaimondoApiError'
  }
}

/**
 * Fetch Kfz-Sachverstaendige near a 5-digit German postal code from the live
 * Claimondo public API. Times out after 15 s, normalises the response, and
 * raises {@link ClaimondoApiError} on any failure (never returns a partial).
 */
export async function fetchSvInNaehe(
  plz: string,
  radius: number,
  apiBase: string = DEFAULT_API_BASE,
): Promise<SvInNaeheResult> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/sv-in-naehe?plz=${encodeURIComponent(plz)}&radius=${radius}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json' }, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(
        `Die Anfrage an Claimondo hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten. Bitte später erneut versuchen.`,
      )
    }
    throw new ClaimondoApiError(
      `Netzwerkfehler bei der Anfrage an Claimondo: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }

  const body = (await res.json().catch(() => ({}))) as RawResponse

  if (!res.ok) {
    if (res.status === 429) {
      throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    }
    throw new ClaimondoApiError(body.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }

  return normalise(body)
}

function normalise(b: RawResponse): SvInNaeheResult {
  return {
    plz: b.plz ?? '',
    radius_km: b.radius_km ?? 0,
    anzahl_treffer: b.anzahl_treffer ?? b.sv_liste?.length ?? 0,
    sachverstaendige: (b.sv_liste ?? []).map((s) => ({
      tier: s.tier ?? 3,
      stadt: s.stadt ?? null,
      entfernung_km: s.entfernung_km ?? 0,
      spezialisierungen: s.spezialisierungen ?? [],
      bewertung_schnitt: s.bewertung_schnitt ?? null,
      bewertung_anzahl: s.bewertung_anzahl ?? null,
    })),
    karte_url: b.karte_url ?? '',
    interaktive_karte_url: b.interaktive_karte_url ?? '',
    buchungs_telefon: b.buchungs_telefon ?? '',
  }
}

/** Human-readable German summary for the markdown response format (user-facing). */
export function formatMarkdown(r: SvInNaeheResult): string {
  const lines: string[] = [`# Kfz-Sachverständige im Umkreis von PLZ ${r.plz} (${r.radius_km} km)`, '']

  if (r.anzahl_treffer === 0) {
    lines.push(
      'Keine Partner-Sachverständigen im angegebenen Umkreis gefunden. Claimondo arbeitet bundesweit — über die interaktive Karte oder den Telefon-Rückruf lässt sich trotzdem ein Termin (in der Regel < 48 h) organisieren.',
    )
  } else {
    lines.push(`**${r.anzahl_treffer}** Treffer (sortiert nach Entfernung):`, '')
    for (const s of r.sachverstaendige.slice(0, 10)) {
      const parts: string[] = [`${s.entfernung_km} km`]
      if (s.stadt) parts.push(s.stadt)
      if (s.bewertung_schnitt != null) parts.push(`${s.bewertung_schnitt}★ (${s.bewertung_anzahl ?? 0})`)
      if (s.spezialisierungen.length > 0) parts.push(s.spezialisierungen.join(', '))
      lines.push(`- ${parts.join(' · ')}`)
    }
    lines.push('', '> Profile sind aus Datenschutzgründen bewusst anonymisiert; die konkrete Zuordnung erfolgt bei Beauftragung.')
  }

  lines.push('')
  if (r.karte_url) lines.push(`![Sachverständige in der Region](${r.karte_url})`)
  if (r.interaktive_karte_url) lines.push(`Interaktive Karte mit freien Terminen: ${r.interaktive_karte_url}`)
  if (r.buchungs_telefon) lines.push(`Telefon-Rückruf (in der Regel < 15 Min): ${r.buchungs_telefon}`)
  lines.push(
    '',
    'Für unverschuldet Geschädigte entstehen 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
  )

  return lines.join('\n')
}

// --- Wissensbasis (llms-full.txt) -------------------------------------------
// Vollstaendige Wissens-Surface (Cornerstones, Spokes, Decoder, BGH-Anker,
// Fakten, Stadt-Pages) als MCP-Resource. Aendert sich selten -> 1 h In-Memory-Cache.

const WISSENSBASIS_PATH = '/llms-full.txt'
const WISSENSBASIS_TTL_MS = 60 * 60 * 1000
let wissensbasisCache: { text: string; ts: number } | null = null

/** Lädt die Claimondo-Wissensbasis (`/llms-full.txt`). 1-h-Cache; wirft {@link ClaimondoApiError} bei Fehlern. */
export async function fetchWissensbasis(apiBase: string = DEFAULT_API_BASE): Promise<string> {
  const now = Date.now()
  if (wissensbasisCache && now - wissensbasisCache.ts < WISSENSBASIS_TTL_MS) {
    return wissensbasisCache.text
  }

  const url = `${apiBase.replace(/\/+$/, '')}${WISSENSBASIS_PATH}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'text/markdown, text/plain' }, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(
        `Die Anfrage an die Claimondo-Wissensbasis hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten.`,
      )
    }
    throw new ClaimondoApiError(
      `Netzwerkfehler beim Laden der Claimondo-Wissensbasis: ${err instanceof Error ? err.message : String(err)}`,
    )
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    throw new ClaimondoApiError(`Die Claimondo-Wissensbasis antwortete mit HTTP ${res.status}.`, res.status)
  }

  const text = await res.text()
  wissensbasisCache = { text, ts: now }
  return text
}
