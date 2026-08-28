// MCP Write-API (Phase 2) — Inkrement 2: Schaden melden + Gutachter/Termin (weicher Hold)
// aus dem LLM-Chat. POST /api/v1/melde-schaden
//
// Server-to-server-Endpoint fuer das MCP-Tool claimondo_melde_schaden (kein Browser-Origin
// -> KEIN Origin-Check wie /api/anfrage-from-lp; stattdessen strenger Rate-Limit + Consent-
// Pflicht + das natuerliche WhatsApp-Gate). Wrappt den BESTEHENDEN Funnel — baut nichts neu:
//   insertAnfrage (gfa, source='mcp') → issueCanonicalFlowLinkForAnfrage (Lead idempotent +
//   EIN flow_link + WhatsApp/SMS/Email-Versand).
//
// Weicher Hold (819dab90-Vorgabe, KEIN langer harter Hold): der gewaehlte SV bleibt als
// gfa.zugeordneter_sv_id (Fixer, vom /flow gelesen) + der Wunsch-Slot als gfa.wunschtermin
// (-> lead.wunschtermin -> Slot-Ranking im /flow). Die eigentliche Termin-Reservierung macht
// der Kunde im /flow (bucheTerminFlow); laeuft der harte 15-min-Hold ab, traegt der weiche
// Hold via terminPending.
//
// Consent (Stage 1, pure-chat): einwilligung.zugestimmt MUSS true sein -> consent_ts ->
// anfragen.dsgvo_zustimmung_am + ein consent_records-Audit. Tiefere Consents (Vollmacht etc.)
// folgen im /flow (Stage 2). Spec: docs/geo/geo-mcp-write-api-review-paket-2026-06-18.md.
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabase/admin'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { klassifiziereReservierungsGrund } from './reservierung-grund'
import { insertAnfrage } from '@/lib/embed/anfrage'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { pruefeSchuldfrage } from '@/lib/geo-deeplink/schuldfrage'
import { bucheTerminFlow } from '@/app/flow/[token]/self-service-actions'
import { findRecentMcpLead } from '@/lib/api-v1/recent-lead-dedup'
import {
  phoneWriteCapExceeded,
  globalWriteCapExceeded,
  recordGlobalWrite,
} from '@/lib/api-v1/write-abuse-guard'
import type { EmbedAnfrageInput } from '@/lib/schemas/embed-anfrage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Strenger als der Read (60/min): ein Write legt einen Lead an + sendet WhatsApp.
const RATE_WINDOW_MS = 60_000
const RATE_MAX = 10
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
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}
function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS })
}

const PHONE_RE = /^\+?[0-9\s\-/()]{8,20}$/
const MeldeSchadenSchema = z.object({
  schadenart: z.string().trim().min(2).max(80),
  hergang: z.string().trim().min(3).max(1000),
  plz: z.string().regex(/^\d{5}$/),
  /** Gewaehlter Gutachter aus claimondo_finde_gutachter_termine (opakes Handle); optional. */
  sv_id: z.string().uuid().optional(),
  /** Konkreter gewaehlter Slot (aus claimondo_finde_gutachter_termine: termine[].start/end)
   *  als ISO-8601. Beide zusammen + sv_id -> echte Reservierung (bucheTerminFlow). */
  slot_start: z.string().max(40).optional(),
  slot_end: z.string().max(40).optional(),
  /** Vager Wunschtermin-Label (weicher Hold), falls kein konkreter Slot gewaehlt wurde. */
  wunschtermin: z.string().max(40).optional(),
  /**
   * Wer den Schaden verursacht hat — `gegner` oder `unklar` (Aliase s.
   * `@/lib/geo-deeplink/schuldfrage`). Optional.
   *
   * Wozu: gesetzt entfaellt fuer den Kunden im FlowLink der komplette Quali-Schritt —
   * `FlowWizardKfz` rechnet `qualiPending = … && !initialSchuldfrage`.
   *
   * ⚠ BEWUSST `z.string()` und NICHT `z.enum([...])`: ein unbekannter Wert soll die
   * Schadenmeldung NICHT scheitern lassen. Der Lead ist das Wertvolle, die Schuldfrage
   * die Zugabe — ein 400er wegen eines Bonusfeldes wuerde den Kunden kosten. Geprueft
   * wird unten mit `pruefeSchuldfrage`; was nicht passt, faellt auf null und der Kunde
   * beantwortet die Frage selbst.
   */
  schuldfrage: z.string().trim().max(40).optional(),
  name: z.string().trim().min(2).max(80),
  telefon: z.string().trim().regex(PHONE_RE),
  /** Stage-1-Einwilligung — Pflicht. zugestimmt MUSS true sein, sonst kein Write. */
  einwilligung: z.object({
    zugestimmt: z.literal(true),
    policy_version: z.string().min(1).max(40),
  }),
})

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function POST(req: Request) {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown'
  // Kanal-Attribution: die echte User-Agent des Aufrufers ('claimondo-mcp-server/<v>' = via
  // unseren MCP-Server; ChatGPT-/OpenAI-UA = GPT-Action direkt; sonst Direktaufruf) wird unten
  // in consent_records.user_agent persistiert -> Aggregat-Auswertung der Lead-Quelle.
  const ua = (req.headers.get('user-agent') ?? '').slice(0, 200) || 'unknown'
  if (rateLimited(ip)) {
    return json({ ok: false, error: 'Rate limit exceeded (10 requests/minute)' }, 429)
  }

  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }
  const parsed = MeldeSchadenSchema.safeParse(raw)
  if (!parsed.success) {
    const consentMissing = parsed.error.issues.some((i) => i.path[0] === 'einwilligung')
    return json(
      {
        ok: false,
        error: consentMissing ? 'einwilligung_erforderlich' : 'validation',
        issues: parsed.error.issues.map((i) => i.path.join('.')),
      },
      400,
    )
  }
  const input = parsed.data

  // Idempotenz (Retry-Dedup): wiederholt der LLM-Client den Tool-Call (Timeout/Reconnect),
  // verwenden wir den bereits angelegten Lead wieder, statt einen zweiten Lead + WhatsApp +
  // Reservierung zu erzeugen. Siehe src/lib/api-v1/recent-lead-dedup.ts.
  const dup = await findRecentMcpLead(input.telefon)
  if (dup) {
    return json(
      {
        ok: true,
        status: 'bereits_angelegt',
        wiederverwendet: true,
        kanal: 'none',
        hinweis:
          'Diese Schadenmeldung wurde bereits angelegt — der Kunde hat seinen persönlichen FlowLink bereits per WhatsApp erhalten. Bitte nicht erneut senden.',
      },
      200,
    )
  }

  // Abuse-Härtung (öffentlicher Write-Endpoint, breit an externe KI-Assistenten): IP-unabhängige
  // Backstops zusätzlich zum Per-IP-Limit. NACH der Retry-Dedup, damit Retries nicht zählen, und
  // VOR jedem Insert/Versand, damit ein geblockter Request weder Lead noch (teure) WhatsApp erzeugt.
  //   1. Per-Telefon-Velocity — stoppt WhatsApp-Bombing derselben Opfer-Nummer.
  //   2. Globaler Circuit-Breaker — deckelt Massen-Spam / Twilio-Kosten prozessweit.
  if (await phoneWriteCapExceeded(input.telefon)) {
    return json(
      {
        ok: false,
        error: 'phone_rate_limit',
        hinweis:
          'Für diese Telefonnummer wurden in kurzer Zeit zu viele Schadenmeldungen angelegt. Bitte später erneut versuchen oder direkt telefonisch melden.',
      },
      429,
    )
  }
  if (globalWriteCapExceeded()) {
    return json(
      {
        ok: false,
        error: 'service_busy',
        hinweis: 'Aktuell sehr viele Anfragen — bitte in wenigen Minuten erneut versuchen.',
      },
      429,
    )
  }
  recordGlobalWrite()

  const center = await geocodeAdresse(input.plz)
  if (!center) return json({ ok: false, error: 'PLZ not found' }, 404)

  // Stage-1-Consent-Zeitpunkt (Server-Zeit der bestaetigten in-chat-Einwilligung).
  const consentTs = new Date().toISOString()

  const payload: EmbedAnfrageInput = {
    name: input.name,
    telefon: input.telefon,
    schadentyp: input.schadenart,
    schadens_kurzbeschreibung: input.hergang,
    source: 'mcp',
    zugeordneter_sv_id: input.sv_id,
    besichtigungsort_lat: center.lat,
    besichtigungsort_lng: center.lng,
    consent_ts: consentTs,
    aktion: 'senden',
  }

  const ins = await insertAnfrage({ payload, variante: null, embedSiteId: null, originDomain: 'mcp' })
  if (!ins.ok) {
    console.error('[melde-schaden] insertAnfrage fehlgeschlagen:', ins.error)
    return json({ ok: false, error: 'insert_failed' }, 500)
  }

  const admin = createAdminClient()

  // Weicher Hold: gewaehlter Slot/Wunsch (ISO) -> gfa.wunschtermin -> lead.wunschtermin
  // (issueCanonical) -> Slot-Ranking im /flow. Bleibt als Async-Fallback, falls die harte
  // Reservierung unten ausbleibt/verfaellt (819dab90: kurz hart reservieren + weicher Hold).
  const wunschterminIso = input.slot_start ?? input.wunschtermin ?? null

  // Die Schuldfrage aus dem Chat, falls die KI sie geklaert hat. Sie muss auf die gfa,
  // BEVOR issueCanonicalFlowLinkForAnfrage() unten laeuft — der Promote liest die Zeile
  // und uebertraegt den Wert nach lead.schuldfrage, was dort den Quali-Schritt entfernt.
  //
  // ⚠ `pruefeSchuldfrage` statt roher Durchgriff: `leads_schuldfrage_check` und
  // `gutachter_finder_anfragen_schuldfrage_check` erlauben NICHT dieselben Werte. Ein
  // Wert ausserhalb der Schnittmenge braeche den Lead-Insert im Promote — also die
  // Flowlink-Ausstellung, nicht nur dieses Feld.
  const schuldfrage = pruefeSchuldfrage(input.schuldfrage)

  // In EINEM Update statt zwei Roundtrips; beide Felder sind optional.
  const nachtrag: Record<string, string> = {}
  if (wunschterminIso) nachtrag.wunschtermin = wunschterminIso
  if (schuldfrage) nachtrag.schuldfrage = schuldfrage
  if (Object.keys(nachtrag).length > 0) {
    const { error: ntErr } = await admin
      .from('gutachter_finder_anfragen')
      .update(nachtrag)
      .eq('id', ins.anfrageId)
    if (ntErr) console.error('[melde-schaden] gfa-Nachtrag fehlgeschlagen:', ntErr.message)
  }

  // Stage-1-Consent-Audit (zusaetzlich zu anfragen.dsgvo_zustimmung_am via consent_ts). Non-fatal.
  try {
    await admin.from('consent_records').insert({
      categories: ['mcp_schaden_melden', 'whatsapp_kontakt', 'drittland_llm'],
      policy_version: input.einwilligung.policy_version,
      user_agent: ua,
      created_at: consentTs,
    })
  } catch (err) {
    console.error('[melde-schaden] consent_records insert fehlgeschlagen:', err)
  }

  // Lead (idempotent) + EIN flow_link + Versand (WhatsApp -> SMS -> Email). Wrappt den
  // bestehenden Funnel — KEIN Token/keine PII zurueck ins LLM (der Link geht per WhatsApp).
  const issued = await issueCanonicalFlowLinkForAnfrage(ins.anfrageId, { send: true })
  if (!issued.ok) {
    console.error('[melde-schaden] issueCanonical fehlgeschlagen:', issued.error)
    // gfa + (falls erstellt) Lead haengen als Safety-Net in der Dispatch-Queue.
    return json(
      {
        ok: true,
        status: 'angelegt_ohne_versand',
        kanal: 'none',
        hinweis: 'Anfrage angelegt; FlowLink-Versand fehlgeschlagen — Dispatch kontaktiert manuell.',
      },
      200,
    )
  }

  // Harte Reservierung (kurzer Hold) — wie der Embed (reserviereEmbedTermin). Nur wenn ein
  // konkreter SV + Slot gewaehlt wurde. bucheTerminFlow ist token-basiert (issued.token),
  // idempotent + race-safe (Engine-EXCLUSION-Constraint). NON-FATAL: bei 'belegt'/Fehler
  // bleibt der weiche Hold (gfa.wunschtermin + zugeordneter_sv_id) -> /flow terminPending.
  let reserviert = false
  let reservierungFehler: string | null = null
  if (input.sv_id && input.slot_start && input.slot_end) {
    try {
      const buchung = await bucheTerminFlow(issued.token, input.sv_id, input.slot_start, input.slot_end)
      if (buchung.ok && buchung.terminId) {
        reserviert = true
        const { error: tidErr } = await admin
          .from('gutachter_finder_anfragen')
          .update({ termin_id: buchung.terminId })
          .eq('id', ins.anfrageId)
        if (tidErr) console.error('[melde-schaden] gfa.termin_id-Update fehlgeschlagen:', tidErr.message)
      } else {
        reservierungFehler = buchung.error ?? 'Reservierung nicht möglich.'
        console.error('[melde-schaden] Reservierung nicht möglich (Soft-Hold bleibt):', buchung.error)
      }
    } catch (err) {
      reservierungFehler = err instanceof Error ? err.message : String(err)
      console.error('[melde-schaden] bucheTerminFlow-Fehler (Soft-Hold bleibt):', err)
    }
  }

  const terminHinweis = reserviert
    ? 'Termin beim gewählten Gutachter reserviert. '
    : input.slot_start
      ? 'Wunschtermin vorgemerkt (finale Bestätigung im Link). '
      : ''
  return json(
    {
      ok: true,
      status: 'angelegt',
      reserviert,
      // Diagnose-Luecke-Fix (Handoff 11.07.): SICHERER Grund-Code, wenn die harte
      // Reservierung nicht feuerte — ein curl/Smoke sieht sofort z.B. 'test_sv_guard'
      // (ohne VPS/pm2, ohne rohe DB-Message zu leaken).
      ...(reservierungFehler ? { reservierung_grund: klassifiziereReservierungsGrund(reservierungFehler) } : {}),
      kanal: issued.kanal,
      hinweis:
        issued.kanal === 'none'
          ? `${terminHinweis}Anfrage angelegt; kein Kontakt-Kanal erreichbar — Dispatch kontaktiert manuell.`
          : `${terminHinweis}Lead angelegt; persönlicher FlowLink per ${issued.kanal} an den Kunden versandt. Kein Link im Chat (Datenschutz).`,
    },
    200,
  )
}
