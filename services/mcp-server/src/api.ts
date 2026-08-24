// API client for Claimondo's public read API.
//
// Wraps GET /api/v1/sv-in-naehe (anonymous, no auth, IP-rate-limited 60/min) —
// the route lives in the main app at src/app/api/v1/sv-in-naehe/route.ts and is
// live on prod. This client is read-only and never sends user data.

// app.claimondo.de = Portal-Host mit den /api/v1-Routen. Der Apex claimondo.de ist
// die Marketing-App (kein /api/v1) — ein Default auf claimondo.de liefert 404 (Prod-
// Incident 20.06., live MCP-Tools waren tot). Override per env CLAIMONDO_API_BASE.
export const DEFAULT_API_BASE = 'https://app.claimondo.de'
// 30 s: /api/v1/sv-in-naehe geocodet + liest die SV-Liste aus der DB und ist daher
// langsam + lastabhaengig (live gemessen 8-15 s+). Lieber eine langsame echte Antwort
// als ein vorzeitiger Timeout. /llms-full.txt ist mit ~0,5 s unkritisch.
const REQUEST_TIMEOUT_MS = 30_000

// Distinktive User-Agent fuer alle ausgehenden Requests an die Claimondo-API. Damit kann die
// REST-Schicht Aufrufe "ueber unseren MCP-Server" von direkten Aufrufen (ChatGPT-GPT-Action,
// curl) unterscheiden — Grundlage fuer die Kanal-Attribution (consent_records.user_agent bei
// melde-schaden + rueckruf). Version hier mitziehen, wenn die Server-Version (1.0.0) steigt.
const MCP_USER_AGENT = 'claimondo-mcp-server/1.0'

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
  ort: string | null
  standort: string
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
  plz?: string | null
  ort?: string | null
  standort?: string
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
 * Fetch Kfz-Sachverstaendige near a German PLZ OR a free-text city/address from
 * the live Claimondo public API. Pass either plz or ort (plz wins if both given).
 * Times out after 30 s, normalises the response, and raises {@link ClaimondoApiError}
 * on any failure (never returns a partial).
 */
export async function fetchSvInNaehe(
  plz: string | undefined,
  ort: string | undefined,
  radius: number,
  apiBase: string = DEFAULT_API_BASE,
): Promise<SvInNaeheResult> {
  const qs = new URLSearchParams({ radius: String(radius) })
  if (plz) qs.set('plz', plz)
  else if (ort) qs.set('ort', ort)
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/sv-in-naehe?${qs.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': MCP_USER_AGENT }, signal: controller.signal })
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
    ort: b.ort ?? null,
    standort: b.standort ?? '',
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
  const standortLabel = r.plz ? `PLZ ${r.plz}` : r.standort || r.ort || 'der Region'
  const lines: string[] = [`# Kfz-Sachverständige im Umkreis von ${standortLabel} (${r.radius_km} km)`, '']

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
    res = await fetch(url, { headers: { accept: 'text/markdown, text/plain', 'user-agent': MCP_USER_AGENT }, signal: controller.signal })
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

// --- Gutachter + Termine (buchbar) ------------------------------------------
// Wrappt GET /api/v1/gutachter-termine (anonym, IP-rate-limited) — buchbare
// Partner-Gutachter MIT freien Slots (anders als sv-in-naehe = nur anonymisierte
// Liste). Vorstufe zum Buchen. Read-only, sendet keine Nutzerdaten.

export type TerminSlot = {
  start: string
  end: string
  passung: string
  /**
   * Buchungs-Link fuer GENAU DIESEN Slot bei GENAU DIESEM Gutachter — der Link, der die
   * Termin-Auswahl im Finder ueberspringt. Optional aus demselben Grund wie
   * `GutachterMitTerminen.buchungs_url`: gegen eine aeltere API-Version fehlt er.
   *
   * ⚠ Er kam bisher NUR ZUFAELLIG bis zum Client: weder Typ noch `slotSchema` kannten ihn,
   * er ueberlebte lediglich, weil die SDK-Validierung unbekannte Keys nicht strippt.
   */
  buchungs_url?: string
}

export type GutachterMitTerminen = {
  id: string
  vorname: string
  profilbild: string | null
  bewertung_schnitt: number | null
  bewertung_anzahl: number | null
  entfernung: string
  ist_top_partner: boolean
  wunschtermin_frei: boolean
  termine: TerminSlot[]
  /**
   * Fertiger Buchungs-Link fuer GENAU diesen Gutachter (`/gutachter-finden?plz=…&sv=<id>`).
   *
   * WARUM optional: Das Feld kam erst mit dem Deep-Link-PR in die oeffentliche API. Dieser
   * Server laeuft eigenstaendig und kann gegen eine aeltere API-Version sprechen — dann
   * fehlt es schlicht, und der Renderer faellt auf die Sammelkarte zurueck (Verhalten wie
   * zuvor). Nie ungeprueft ausgeben.
   */
  buchungs_url?: string
}

export type GutachterTermineResult = {
  plz: string
  ort: string | null
  standort: string
  wunschtermin: string | null
  anzahl_gutachter: number
  gutachter: GutachterMitTerminen[]
  interaktive_karte_url: string
  buchungs_telefon: string
}

interface RawGutachterTermine {
  plz?: string | null
  ort?: string | null
  standort?: string
  wunschtermin?: string | null
  anzahl_gutachter?: number
  gutachter?: GutachterMitTerminen[]
  interaktive_karte_url?: string
  buchungs_telefon?: string
  error?: string
}

/** Fetch buchbare Gutachter + freie Slots zu einer PLZ ODER einem Freitext-Ort (plz gewinnt,
 *  wenn beides gesetzt). Timeout 30 s, wirft {@link ClaimondoApiError}. */
export async function fetchGutachterTermine(
  plz: string | undefined,
  ort: string | undefined,
  wunschtermin: string | undefined,
  apiBase: string = DEFAULT_API_BASE,
): Promise<GutachterTermineResult> {
  const qs = new URLSearchParams()
  if (plz) qs.set('plz', plz)
  else if (ort) qs.set('ort', ort)
  if (wunschtermin) qs.set('wunschtermin', wunschtermin)
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/gutachter-termine?${qs.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': MCP_USER_AGENT }, signal: controller.signal })
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
  const body = (await res.json().catch(() => ({}))) as RawGutachterTermine
  if (!res.ok) {
    if (res.status === 429) {
      throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    }
    throw new ClaimondoApiError(body.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return {
    plz: body.plz ?? plz ?? '',
    ort: body.ort ?? null,
    standort: body.standort ?? '',
    wunschtermin: body.wunschtermin ?? null,
    anzahl_gutachter: body.anzahl_gutachter ?? body.gutachter?.length ?? 0,
    gutachter: body.gutachter ?? [],
    interaktive_karte_url: body.interaktive_karte_url ?? '',
    buchungs_telefon: body.buchungs_telefon ?? '',
  }
}

function formatSlot(iso: string): string {
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Berlin',
    })
  } catch {
    return iso
  }
}

/** Menschenlesbare deutsche Zusammenfassung (markdown response_format, user-facing). */
export function formatGutachterTermine(r: GutachterTermineResult): string {
  const standortLabel = r.plz ? `PLZ ${r.plz}` : r.standort || r.ort || 'der Region'
  const lines: string[] = [`# Buchbare Kfz-Gutachter + freie Termine — ${standortLabel}`, '']
  if (r.anzahl_gutachter === 0) {
    lines.push(
      'Aktuell kein Partner-Gutachter mit freien Online-Terminen im Umkreis. Über die interaktive Karte oder den Telefon-Rückruf lässt sich trotzdem ein Termin (i. d. R. < 48 h) organisieren.',
    )
  } else {
    for (const g of r.gutachter) {
      const head: string[] = [g.vorname]
      if (g.bewertung_schnitt != null) head.push(`${g.bewertung_schnitt}★ (${g.bewertung_anzahl ?? 0})`)
      head.push(g.entfernung)
      if (g.ist_top_partner) head.push('Empfohlener Partner')
      lines.push(`## ${head.join(' · ')}`)
      if (g.termine.length === 0) {
        lines.push('_keine freien Slots_')
      } else {
        for (const t of g.termine) {
          const label = `${formatSlot(t.start)}${t.passung === 'wunschtermin' ? ' (Wunschtermin frei)' : ''}`
          // Jeder Slot traegt SEINEN eigenen Buchungslink. Vorher standen hier nur die
          // Uhrzeiten und darunter EIN Link auf den Gutachter — der Kunde landete also im
          // Finder und musste den Termin, den die KI ihm gerade genannt hatte, erneut
          // heraussuchen. Der Slot-Link ueberspringt genau diesen Schritt.
          // ⚠ Der Wert steckt im structuredContent laengst drin; er fehlte nur im TEXT —
          // und den liest ein Modell zuverlaessiger als das strukturierte Feld.
          lines.push(t.buchungs_url ? `- [${label}](${t.buchungs_url})` : `- ${label}`)
        }
      }
      // Der Direktlink GENAU zu diesem Gutachter. Ohne ihn nannte diese Ausgabe Gutachter
      // namentlich mit Uhrzeiten und verwies dann auf die anonyme Sammelkarte — der Nutzer
      // musste die eben gelesene Empfehlung dort erneut heraussuchen. Fehlt das Feld (aeltere
      // API-Version), bleibt es wie zuvor bei der Karte am Ende.
      if (g.buchungs_url) lines.push('', `→ Termin bei ${g.vorname} buchen: ${g.buchungs_url}`)
      lines.push('')
    }
    // Die Anleitung, was ein Termin-Link TUT. Sie stand bisher nur im API-Feld
    // `buchungs_hinweis`, das der MCP-Weg gar nicht ausgibt — das Modell sah also Links,
    // ohne zu wissen, dass sie den Termin bereits mitbringen.
    lines.push(
      '> Ein Termin-Link öffnet den Finder mit Gutachter UND Termin vorausgewählt — der Kunde ergänzt nur noch Adresse, Schadenart und Kontaktdaten und bestätigt selbst. Ist der Slot bis dahin belegt, fällt der Finder still auf die normale Auswahl zurück.',
    )
    lines.push('> Profile anonymisiert; die konkrete Zuordnung + Buchung erfolgt bei Beauftragung.')
  }
  lines.push('')
  // Sobald es Direktlinks gibt, ist die Karte NICHT mehr der Buchungsweg, sondern die
  // Uebersicht — sonst konkurrieren zwei "Buchung"-Links und der schwaechere gewinnt oft.
  const hatDirektlinks = r.gutachter.some((g) => g.buchungs_url)
  if (r.interaktive_karte_url) {
    lines.push(
      hatDirektlinks
        ? `Alle Gutachter auf der Karte: ${r.interaktive_karte_url}`
        : `Interaktive Karte / Buchung: ${r.interaktive_karte_url}`,
    )
  }
  if (r.buchungs_telefon) lines.push(`Telefon-Rückruf (i. d. R. < 15 Min): ${r.buchungs_telefon}`)
  lines.push(
    '',
    'Für unverschuldet Geschädigte 0 € Eigenkosten nach § 249 BGB (vorbehaltlich Anerkenntnis durch den gegnerischen Haftpflichtversicherer).',
  )
  return lines.join('\n')
}

// --- Schaden melden (WRITE: Lead + FlowLink + WhatsApp) ----------------------
// Wrappt POST /api/v1/melde-schaden. ANDERS als die Read-Tools: das ist eine SCHREIBENDE
// Aktion (legt einen Lead an + sendet dem Kunden den FlowLink per WhatsApp). Consent-Pflicht.

export type MeldeSchadenInput = {
  schadenart: string
  hergang: string
  plz: string
  sv_id?: string
  /** Konkreter gewaehlter Slot (gutachter[].termine[].start/end). Beide + sv_id -> echte Reservierung. */
  slot_start?: string
  slot_end?: string
  wunschtermin?: string
  name: string
  telefon: string
  /** MUSS true sein + NUR nach ausdruecklicher Nutzer-Einwilligung gesetzt werden (Stage-1-Consent). */
  einwilligung_erteilt: boolean
}

export type MeldeSchadenResult = { ok: boolean; status: string; kanal: string; hinweis: string }

// Version des in-chat gezeigten Einwilligungs-/Datenschutz-Texts (Stage-1-Consent-Audit).
const MCP_CONSENT_POLICY_VERSION = 'mcp-consent-2026-06'

/** Meldet einen Schaden (Lead + FlowLink + WhatsApp-Versand). Wirft {@link ClaimondoApiError} bei Fehlern/fehlender Einwilligung. */
export async function meldeSchaden(
  input: MeldeSchadenInput,
  apiBase: string = DEFAULT_API_BASE,
): Promise<MeldeSchadenResult> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/melde-schaden`
  const body = {
    schadenart: input.schadenart,
    hergang: input.hergang,
    plz: input.plz,
    sv_id: input.sv_id,
    wunschtermin: input.wunschtermin,
    slot_start: input.slot_start,
    slot_end: input.slot_end,
    name: input.name,
    telefon: input.telefon,
    einwilligung: { zugestimmt: input.einwilligung_erteilt, policy_version: MCP_CONSENT_POLICY_VERSION },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': MCP_USER_AGENT },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
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
  const data = (await res.json().catch(() => ({}))) as {
    ok?: boolean
    status?: string
    kanal?: string
    hinweis?: string
    error?: string
  }
  if (!res.ok || data.ok === false) {
    if (res.status === 429) {
      throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    }
    if (data.error === 'einwilligung_erforderlich') {
      throw new ClaimondoApiError(
        'Einwilligung erforderlich: Der Nutzer muss der Datenverarbeitung + dem WhatsApp-Kontakt (inkl. Drittland-Hinweis) ausdrücklich zustimmen, bevor der Schaden gemeldet wird. Bitte erst die Zustimmung einholen.',
        400,
      )
    }
    throw new ClaimondoApiError(data.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return { ok: true, status: data.status ?? 'angelegt', kanal: data.kanal ?? 'none', hinweis: data.hinweis ?? '' }
}

// --- Anspruch-Check (Beratung, read-only) -----------------------------------
// Wrappt GET /api/v1/pruefe-anspruch. Strukturierter Anspruchskatalog nach
// Schuldfrage + IMMER der naechste Schritt (Gutachter + Termin / Rueckruf).

export type Anspruch = { titel: string; norm: string; hinweis: string }
export type PruefeAnspruchResult = {
  schuldfrage: string
  schadenart: string | null
  /** haftpflicht | kasko | selbstzahler | null — die Weiche, welchen Weg der Assistent
   *  anbieten muss. null = Kasko-Frage bei Selbstverschulden noch offen. */
  abrechnungsweg?: string | null
  anspruchslage: string
  eigenkosten: string
  ansprueche: Anspruch[]
  empfehlung: string
  naechster_schritt: string
  hinweis: string
}

/** Prueft die Schadensersatz-Ansprueche nach Schuldfrage. Wirft {@link ClaimondoApiError} bei Fehlern. */
export async function fetchPruefeAnspruch(
  schuldfrage: string,
  schadenart: string | undefined,
  apiBase: string = DEFAULT_API_BASE,
  vollkasko?: 'ja' | 'nein',
): Promise<PruefeAnspruchResult> {
  const qs = new URLSearchParams({ schuldfrage })
  if (schadenart) qs.set('schadenart', schadenart)
  // Nur bei Selbstverschulden ausgewertet; ohne den Wert fordert die API zur Rueckfrage auf.
  if (vollkasko) qs.set('vollkasko', vollkasko)
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/pruefe-anspruch?${qs.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': MCP_USER_AGENT }, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(`Die Anfrage an Claimondo hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten.`)
    }
    throw new ClaimondoApiError(`Netzwerkfehler bei der Anfrage an Claimondo: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as Partial<PruefeAnspruchResult> & { error?: string }
  if (!res.ok) {
    if (res.status === 429) throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten.', 429)
    throw new ClaimondoApiError(data.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return {
    schuldfrage: data.schuldfrage ?? schuldfrage,
    schadenart: data.schadenart ?? null,
    // ⚠ Dieses Mapping ist Feld-fuer-Feld: ein hier FEHLENDES Feld faellt still weg,
    // auch wenn Typ + outputSchema es deklarieren (optional -> tsc schweigt). Genau
    // das passierte `abrechnungsweg`: die API lieferte 'kasko', die Tool-Description
    // verwies das Modell ausdruecklich darauf — und es kam nie an.
    abrechnungsweg: data.abrechnungsweg ?? null,
    anspruchslage: data.anspruchslage ?? 'unklar',
    eigenkosten: data.eigenkosten ?? '',
    ansprueche: data.ansprueche ?? [],
    empfehlung: data.empfehlung ?? '',
    naechster_schritt: data.naechster_schritt ?? '',
    hinweis: data.hinweis ?? '',
  }
}

/** Menschenlesbarer Markdown-Report fuer den Anspruch-Check. */
export function formatPruefeAnspruch(r: PruefeAnspruchResult): string {
  const lines: string[] = [`# Ansprüche bei Schuldfrage: ${r.schuldfrage}`, '', `**Eigenkosten:** ${r.eigenkosten}`, '', r.empfehlung, '']
  if (r.ansprueche.length > 0) {
    lines.push('**Ihre Ansprüche:**')
    for (const a of r.ansprueche) lines.push(`- **${a.titel}** (${a.norm}) — ${a.hinweis}`)
    lines.push('')
  }
  // Den Abrechnungsweg AUCH in den Text: `structuredContent` liest nicht jeder Client,
  // der Markdown-Text landet dagegen immer im Modell-Kontext.
  if (r.abrechnungsweg) {
    const wege: Record<string, string> = {
      haftpflicht: 'Gegnerische Haftpflicht — Gutachter zuerst, für Sie kostenfrei (§ 249 BGB).',
      kasko: 'Eigene Vollkasko — Werkstatt zuerst; die Versicherung reguliert abzüglich Selbstbeteiligung.',
      selbstzahler: 'Selbstzahler — Werkstatt zuerst; ein Kostenvoranschlag genügt meist.',
    }
    lines.push(`**Abrechnungsweg:** ${wege[r.abrechnungsweg] ?? r.abrechnungsweg}`, '')
  }
  lines.push(`**Nächster Schritt:** ${r.naechster_schritt}`, '', `_${r.hinweis}_`)
  return lines.join('\n')
}

// --- Brief-Decoder (Beratung, read-only) ------------------------------------
// Wrappt POST /api/v1/decode-brief. Entschluesselt ein Schreiben der gegnerischen
// Haftpflichtversicherung (Kuerzungs-/Hinhalte-Formulierungen) + IMMER der naechste
// Schritt (unabhaengiger Gutachter + Termin / Rueckruf).

export type DecodeBriefBefund = { phrase: string; bedeutet: string; recht: string; norm: string | null }
export type DecodeBriefResult = {
  erkannte_muster: number
  befunde: DecodeBriefBefund[]
  einschaetzung: string
  naechster_schritt: string
  hinweis: string
}

/** Entschluesselt ein Versicherer-Schreiben. Wirft {@link ClaimondoApiError} bei Fehlern. */
export async function fetchDecodeBrief(text: string, apiBase: string = DEFAULT_API_BASE): Promise<DecodeBriefResult> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/decode-brief`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': MCP_USER_AGENT },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(`Die Anfrage an Claimondo hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten.`)
    }
    throw new ClaimondoApiError(`Netzwerkfehler bei der Anfrage an Claimondo: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as Partial<DecodeBriefResult> & { error?: string }
  if (!res.ok) {
    if (res.status === 429) throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten.', 429)
    throw new ClaimondoApiError(data.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return {
    erkannte_muster: data.erkannte_muster ?? data.befunde?.length ?? 0,
    befunde: data.befunde ?? [],
    einschaetzung: data.einschaetzung ?? '',
    naechster_schritt: data.naechster_schritt ?? '',
    hinweis: data.hinweis ?? '',
  }
}

/** Menschenlesbarer Markdown-Report fuer den Brief-Decoder. */
export function formatDecodeBrief(r: DecodeBriefResult): string {
  const lines: string[] = [`# Decoder: ${r.erkannte_muster} typische Versicherer-Formulierung(en) erkannt`, '', r.einschaetzung, '']
  for (const b of r.befunde) {
    lines.push(`## „${b.phrase}"`)
    lines.push(`**Was das bedeutet:** ${b.bedeutet}`)
    lines.push(`**Ihr Recht:** ${b.recht}${b.norm ? ` (${b.norm})` : ''}`, '')
  }
  lines.push(`**Nächster Schritt:** ${r.naechster_schritt}`, '', `_${r.hinweis}_`)
  return lines.join('\n')
}

// --- Rückruf anfordern (Write, Consent) -------------------------------------
// Wrappt POST /api/v1/rueckruf. Der zweite Funnel-Arm neben melde-schaden: ein
// Berater ruft den Kunden telefonisch zurueck (statt FlowLink). Consent-Pflicht.

export type RueckrufInput = {
  name: string
  telefon: string
  schadenart?: string
  anliegen?: string
  plz?: string
  ort?: string
  /** Optionale Wunschzeit (ISO-8601). Ohne -> schnellstmoeglich (ASAP). */
  wunschzeit?: string
  /** MUSS true sein + NUR nach ausdruecklicher Nutzer-Einwilligung (Datenverarbeitung + Telefon-Kontakt). */
  einwilligung_erteilt: boolean
}
export type RueckrufResult = { ok: boolean; status: string; wann: string; hinweis: string }

/** Fordert einen Telefon-Rueckruf an (Lead + Dispatch-Task). Wirft {@link ClaimondoApiError} bei Fehlern/fehlender Einwilligung. */
export async function fetchRueckruf(input: RueckrufInput, apiBase: string = DEFAULT_API_BASE): Promise<RueckrufResult> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/rueckruf`
  const body = {
    name: input.name,
    telefon: input.telefon,
    schadenart: input.schadenart,
    anliegen: input.anliegen,
    plz: input.plz,
    ort: input.ort,
    wunschzeit: input.wunschzeit,
    einwilligung: { zugestimmt: input.einwilligung_erteilt, policy_version: MCP_CONSENT_POLICY_VERSION },
  }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': MCP_USER_AGENT },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(`Die Anfrage an Claimondo hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten.`)
    }
    throw new ClaimondoApiError(`Netzwerkfehler bei der Anfrage an Claimondo: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; wann?: string; hinweis?: string; error?: string }
  if (!res.ok || data.ok === false) {
    if (res.status === 429) throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    if (data.error === 'einwilligung_erforderlich') {
      throw new ClaimondoApiError(
        'Einwilligung erforderlich: Der Nutzer muss der Datenverarbeitung + dem telefonischen Kontakt ausdrücklich zustimmen, bevor der Rückruf angefordert wird. Bitte erst die Zustimmung einholen.',
        400,
      )
    }
    throw new ClaimondoApiError(data.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return { ok: true, status: data.status ?? 'rueckruf_angelegt', wann: data.wann ?? 'schnellstmöglich', hinweis: data.hinweis ?? '' }
}

/** Menschenlesbarer Markdown-Report fuer den Rückruf. */
export function formatRueckruf(r: RueckrufResult): string {
  return [`# Rückruf angefordert`, '', `**Wann:** ${r.wann}`, '', r.hinweis].join('\n')
}

// --- Fall-Status (read-only, coarse, PII-frei) -------------------------------
// Wrappt GET /api/v1/case-status/{token}. Der wiederkehrende Kunde nennt sein EIGENES
// Token (aus dem WhatsApp-FlowLink) — das Token ist die Autorisierung. Die Antwort ist
// bewusst grob + PII-frei (nur ein kunde-Status-Label, kein Name/Telefon/SV/Fall-Detail).

export type CaseStatusResult = { ok: boolean; status: string; hinweis: string }

/** Fragt den groben Bearbeitungsstand per FlowLink-Token ab. 404 (unbekanntes/ungueltiges
 *  Token) -> {@link ClaimondoApiError} mit freundlicher Meldung. */
export async function fetchCaseStatus(token: string, apiBase: string = DEFAULT_API_BASE): Promise<CaseStatusResult> {
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/case-status/${encodeURIComponent(token)}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(url, { headers: { accept: 'application/json', 'user-agent': MCP_USER_AGENT }, signal: controller.signal })
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new ClaimondoApiError(`Die Anfrage an Claimondo hat das Zeitlimit (${REQUEST_TIMEOUT_MS / 1000} s) überschritten.`)
    }
    throw new ClaimondoApiError(`Netzwerkfehler bei der Anfrage an Claimondo: ${err instanceof Error ? err.message : String(err)}`)
  } finally {
    clearTimeout(timer)
  }
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; status?: string; hinweis?: string; error?: string }
  if (!res.ok || data.ok === false) {
    if (res.status === 429) throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    if (res.status === 404) {
      throw new ClaimondoApiError(
        'Kein Fall zu dieser Referenz gefunden. Bitte lass dir vom Kunden die Fall-Referenz aus seinem persönlichen Claimondo-Link (per WhatsApp erhalten) nennen.',
        404,
      )
    }
    throw new ClaimondoApiError(data.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return { ok: true, status: data.status ?? 'unbekannt', hinweis: data.hinweis ?? '' }
}

/** Menschenlesbarer Markdown-Report fuer den Fall-Status. */
export function formatCaseStatus(r: CaseStatusResult): string {
  return [`# Bearbeitungsstand`, '', `**Status:** ${r.status}`, r.hinweis ? `\n${r.hinweis}` : ''].filter(Boolean).join('\n')
}


// ─────────────────────────────────────────────────────────────────────────────
// Werkstatt-Suche (claimondo_finde_werkstatt)
//
// WARUM DIESES TOOL: Fuer selbst verschuldete Schaeden ist der Gutachter NICHT der
// erste Schritt — es gibt keinen Gegner, gegen den man etwas durchsetzt. Der Kunde
// braucht eine Werkstatt (Vollkasko reguliert abzueglich SB, ohne Kasko zahlt er selbst
// und will einen Kostenvoranschlag). Ohne dieses Tool endete jede Beratung beim
// Gutachter — auch dort, wo er dem Kunden nur Kosten verursacht haette.
//
// ⚠ Die API liefert BEWUSST keine Firmennamen, Telefonnummern oder Adressen: die
// konkrete Zuordnung passiert im Finder, wo der Lead entsteht. Wer hier Namen
// ausgibt, oeffnet den Weg an Claimondo vorbei. Der Renderer haelt sich daran.
export type WerkstattPublic = {
  id: string
  typ: string | null
  ort: string | null
  plz: string | null
  entfernung: string
  entfernung_km: number | null
  marken: string[]
  faehigkeiten: string[]
  bewertung_schnitt: number | null
  bewertung_anzahl: number | null
  ist_partner: boolean
  finder_url: string
}

export type WerkstattResult = {
  plz: string | null
  ort: string | null
  radius_km: number
  anzahl_treffer: number
  werkstaetten: WerkstattPublic[]
  werkstatt_finder_url: string
  buchungs_telefon: string
  hinweis: string
  nutzungshinweis: string
}

export async function fetchWerkstaetten(
  plz: string | undefined,
  ort: string | undefined,
  radius: number,
  apiBase: string = DEFAULT_API_BASE,
): Promise<WerkstattResult> {
  const qs = new URLSearchParams({ radius: String(radius) })
  if (plz) qs.set('plz', plz)
  else if (ort) qs.set('ort', ort)
  const url = `${apiBase.replace(/\/+$/, '')}/api/v1/werkstatt-in-naehe?${qs.toString()}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let res: Response
  try {
    res = await fetch(url, {
      headers: { accept: 'application/json', 'user-agent': MCP_USER_AGENT },
      signal: controller.signal,
    })
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

  const body = (await res.json().catch(() => ({}))) as Partial<WerkstattResult> & { error?: string }
  if (!res.ok) {
    if (res.status === 429) {
      throw new ClaimondoApiError('Zu viele Anfragen (Rate-Limit). Bitte kurz warten und erneut versuchen.', 429)
    }
    throw new ClaimondoApiError(body.error ?? `Die Claimondo-API antwortete mit HTTP ${res.status}.`, res.status)
  }
  return {
    plz: body.plz ?? plz ?? null,
    ort: body.ort ?? ort ?? null,
    radius_km: body.radius_km ?? radius,
    anzahl_treffer: body.anzahl_treffer ?? body.werkstaetten?.length ?? 0,
    werkstaetten: body.werkstaetten ?? [],
    werkstatt_finder_url: body.werkstatt_finder_url ?? '',
    buchungs_telefon: body.buchungs_telefon ?? '',
    hinweis: body.hinweis ?? '',
    nutzungshinweis: body.nutzungshinweis ?? '',
  }
}

/** Menschenlesbare deutsche Zusammenfassung (markdown response_format, user-facing). */
export function formatWerkstaetten(r: WerkstattResult): string {
  const standortLabel = r.plz ? `PLZ ${r.plz}` : r.ort || 'der Region'
  const lines: string[] = [`# Partner-Werkstätten — ${standortLabel} (${r.radius_km} km)`, '']

  if (r.anzahl_treffer === 0) {
    lines.push(
      'Aktuell keine Partner-Werkstatt im angegebenen Umkreis. Über den Werkstatt-Finder oder den Telefon-Rückruf lässt sich trotzdem eine Werkstatt vermitteln.',
    )
  } else {
    lines.push(`**${r.anzahl_treffer}** Partner-Werkstätten (sortiert nach Entfernung):`, '')
    for (const w of r.werkstaetten.slice(0, 8)) {
      const teile: string[] = [w.entfernung]
      if (w.ort) teile.push(w.ort)
      if (w.typ) teile.push(w.typ)
      if (w.bewertung_schnitt != null) teile.push(`${w.bewertung_schnitt}★ (${w.bewertung_anzahl ?? 0})`)
      lines.push(`- ${teile.join(' · ')}`)
      const koennen = [...(w.marken ?? []), ...(w.faehigkeiten ?? [])].slice(0, 4)
      if (koennen.length > 0) lines.push(`  ${koennen.join(', ')}`)
    }
    // Bewusst KEINE Namen/Telefonnummern — die API liefert sie gar nicht erst.
    lines.push('', '> Konkrete Zuordnung, Terminabstimmung und Abrechnung laufen über Claimondo.')
  }

  lines.push('')
  if (r.werkstatt_finder_url) lines.push(`→ Werkstatt finden: ${r.werkstatt_finder_url}`)
  if (r.buchungs_telefon) lines.push(`Telefon-Rückruf (i. d. R. < 15 Min): ${r.buchungs_telefon}`)
  if (r.hinweis) lines.push('', r.hinweis)
  return lines.join('\n')
}
