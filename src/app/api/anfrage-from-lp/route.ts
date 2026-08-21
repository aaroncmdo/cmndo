import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createHash } from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { EmbedAnfrageSchema } from '@/lib/schemas/embed-anfrage'
import {
  ladeEmbedSite,
  insertAnfrage,
  notifyAnfrage,
  extractHost,
  clusterAllowlist,
  anonAllowlist,
  type AnfrageVariante,
  type EmbedSiteConfig,
} from '@/lib/embed/anfrage'
import { verifySiteToken } from '@/lib/embed/jwt'
import { herkunftAusReferer } from '@/lib/analytics/herkunft'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'

/**
 * AAR-939 · Monika-Embed · Stream 2 — Webhook /api/anfrage-from-lp
 *
 * Single Source of Truth fuer den Anfrage-Empfang. Cluster-LPs
 * (source='kfz_gutachter_lp') UND SV-Embeds (source='sv_embed') POSTen hierher.
 * Cross-Origin → CORS offen (POST). Schreibt via service_role in
 * gutachter_finder_anfragen (REUSE), Benachrichtigung non-blocking via after().
 *
 * Auth-Schichten:
 *   1. Zod-Validierung + Honeypot
 *   2. Origin-Check (Cluster-Allowlist bzw. embed_sites.erlaubte_domains)
 *   3. Rate-Limit (check_gfa_rate_limit RPC, pro IP-Hash) — Embed fail-closed, native fail-open
 *   4. Site-Token-Verify (verifySiteToken, HS256) — NUR sv_embed. Das Widget holt
 *      das Token von /api/embed/config (signiert auf embed_sites.slug) und sendet
 *      es mit; Verify bindet den Submit an eine legitime Config-Ausgabe. Ohne diese
 *      Schicht koennte jeder mit bekanntem embed_site_slug ueber den offenen
 *      CORS-Webhook fremde SV-Anfragen → fremde €70-Billing-Positionen erzeugen.
 *      Cluster-LP (kfz_gutachter_lp) hat kein Token → bleibt bei Origin-Allowlist.
 */

export const dynamic = 'force-dynamic'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, { status, headers: CORS_HEADERS })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS })
}

export async function POST(req: NextRequest) {
  // ── 1. Payload parsen + validieren ──────────────────────────────────────
  let raw: unknown
  try {
    raw = await req.json()
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400)
  }

  const parsed = EmbedAnfrageSchema.safeParse(raw)
  if (!parsed.success) {
    // Honeypot-Treffer (honeypot.max(0)) sieht aus wie 200, damit Bots nichts lernen
    const honeypotHit = parsed.error.issues.some((i) => i.path[0] === 'honeypot')
    if (honeypotHit) return json({ ok: true, anfrage_id: null }, 200)
    return json({ ok: false, error: 'validation', issues: parsed.error.issues.map((i) => i.path.join('.')) }, 400)
  }
  const payload = parsed.data

  // ── 2. Origin-Check ──────────────────────────────────────────────────────
  const originHost = extractHost(req.headers.get('origin')) ?? extractHost(req.headers.get('referer'))

  let site: EmbedSiteConfig | null = null
  let variante: AnfrageVariante | null = null

  if (payload.source === 'sv_embed') {
    if (!payload.embed_site_slug) return json({ ok: false, error: 'embed_site_slug fehlt' }, 400)
    site = await ladeEmbedSite(payload.embed_site_slug)
    if (!site) return json({ ok: false, error: 'embed_site unbekannt' }, 404)
    if (!site.aktiv) return json({ ok: false, error: 'embed_site pausiert' }, 403)
    // Origin muss in der Allowlist der Site sein
    const allow = site.erlaubte_domains.map((d) => d.toLowerCase().replace(/^www\./, ''))
    if (allow.length > 0 && (!originHost || !allow.includes(originHost))) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403)
    }
    // ── 4. Site-Token-Verify (Anti-Slug-Spoofing, nur sv_embed) ──────────────
    // Das Token wird von /api/embed/config auf embed_sites.slug signiert; der
    // beanspruchte embed_site_slug muss exakt dazu passen. Fail-closed:
    // ungueltig/abgelaufen/Secret-unset → verifySiteToken liefert null → 401.
    const tokenPayload = await verifySiteToken(payload.site_token)
    if (!tokenPayload || tokenPayload.site !== payload.embed_site_slug) {
      return json({ ok: false, error: 'invalid_site_token' }, 401)
    }
    variante = site.variante
  } else if (payload.source === 'generic_lp') {
    // generic_lp (anon-Portal, z.B. autounfall.io): Origin gegen Cluster- + anon-Allowlist
    // (MONIKA_ANON_DOMAINS). Kein Cluster/SV -> Lead landet anon in der Dispatch-Queue.
    const allow = [...clusterAllowlist(), ...anonAllowlist()]
    if (!originHost || !allow.includes(originHost)) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403)
    }
    variante = null // anon-Portal hat keine A/B-Variante
  } else {
    // kfz_gutachter_lp: gegen die fixen Cluster-Domains
    const allow = clusterAllowlist()
    if (!originHost || !allow.includes(originHost)) {
      return json({ ok: false, error: 'origin_not_allowed' }, 403)
    }
    variante = null // Cluster-LP hat keine A/B-Variante
  }

  // ── 3. Rate-Limit (Reuse check_gfa_rate_limit, pro IP-Hash) ──────────────
  // Fail-Mode quelle-abhaengig: Embed-Quellen (sv_embed/kfz_gutachter_lp) sind
  // ein offener cross-origin-CORS-Webhook = exponierte Angriffsflaeche →
  // FAIL-CLOSED (RPC-Fehler ODER fehlende IP ⇒ ablehnen, kein ungebremster
  // Schreibpfad gegen eine evtl. gestresste DB). Der native Funnel (source NULL,
  // same-origin, bestehende getestete Conversion-Strecke) bleibt FAIL-OPEN —
  // Verfuegbarkeit > Strenge, unveraendertes Verhalten.
  const isEmbedSource = payload.source === 'sv_embed' || payload.source === 'kfz_gutachter_lp' || payload.source === 'generic_lp'
  const ipRaw =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip')?.trim() ||
    null
  if (ipRaw) {
    const ipHash = createHash('sha256').update(ipRaw).digest('hex')
    const db = createAdminClient()
    const { data: allowed, error: rlErr } = await db.rpc('check_gfa_rate_limit', { p_ip_hash: ipHash })
    if (rlErr) {
      console.error('[AAR-939] rate-limit rpc failed:', rlErr.message)
      // Embed: fail-closed (503 = transient, Client darf retryen). Native: fail-open.
      if (isEmbedSource) return json({ ok: false, error: 'rate_limit_unavailable' }, 503)
    } else if (allowed === false) {
      return json({ ok: false, error: 'rate_limited' }, 429)
    }
  } else if (isEmbedSource) {
    // Keine ableitbare IP bei einer Embed-Anfrage = kein Rate-Limit moeglich →
    // fail-closed. Hinter nginx/VPS ist x-forwarded-for/x-real-ip immer gesetzt;
    // ein Fehlen deutet auf einen umgangenen Proxy / direkten Hit.
    console.error('[AAR-939] embed-Anfrage ohne ableitbare IP — abgelehnt (fail-closed)')
    return json({ ok: false, error: 'rate_limit_unavailable' }, 503)
  }

  // ── 3b. Attribution serverseitig ergaenzen ───────────────────────────────
  // `buildAnfrageColumns` schreibt page_url + die fuenf utm_* seit jeher — aber
  // nur, was der CLIENT mitschickt. Gemessen am 21.08.2026 ueber alle 44 Zeilen
  // von `gutachter_finder_anfragen`: page_url in **einer**, utm_* in **keiner**.
  // Der Weg war also da, es lief nur nichts hindurch, und damit liess sich keine
  // der 678 Marketingseiten einer Anfrage zuordnen.
  //
  // Der Referer sagt dasselbe, ohne dass ein Client daran denken muss. Client hat
  // Vorrang (er kennt die Landing-URL vor internen Navigationen), der Referer
  // fuellt nur die Luecken — bestehendes Verhalten bleibt damit unveraendert.
  // Datensparsam: nur origin+pathname + die fuenf UTM (s. lib/analytics/herkunft.ts).
  const herkunft = herkunftAusReferer(req.headers.get('referer'))
  const payloadMitHerkunft = {
    ...payload,
    page_url: payload.page_url ?? herkunft.page_url ?? undefined,
    utm_source: payload.utm_source ?? herkunft.utm_source ?? undefined,
    utm_medium: payload.utm_medium ?? herkunft.utm_medium ?? undefined,
    utm_campaign: payload.utm_campaign ?? herkunft.utm_campaign ?? undefined,
    utm_term: payload.utm_term ?? herkunft.utm_term ?? undefined,
    utm_content: payload.utm_content ?? herkunft.utm_content ?? undefined,
  }

  // ── 4. Insert ────────────────────────────────────────────────────────────
  const result = await insertAnfrage({
    payload: payloadMitHerkunft,
    variante,
    embedSiteId: site?.id ?? null,
    originDomain: originHost,
  })
  if (!result.ok) {
    console.error('[AAR-939] insertAnfrage failed:', result.error)
    return json({ ok: false, error: 'insert_failed' }, 500)
  }

  // ── 4b. AAR-956 P3: 2-Knopf-Funnel (aktion). Eine explizite Aktion vom Formular
  // entscheidet VOR dem Legacy-funnel_modus-Branch (D3-deprecate-Vorlauf):
  //   'direkt' → issue OHNE Versand (opts.send=false) → Token zurueck → Client
  //              redirectet nach /flow/[token] (Self-Onboarding sofort).
  //   'senden' → issue MIT Versand (WA→SMS→Email, persistiert via P2) → Lead haengt
  //              zusaetzlich in der Dispatch-Queue (manueller Kontakt).
  // Fehlt aktion (heutige Monika-Embed/Cluster-Caller) → Fall-through, unveraendert.
  if (payload.aktion === 'direkt' || payload.aktion === 'senden') {
    const issued = await issueCanonicalFlowLinkForAnfrage(result.anfrageId, {
      send: payload.aktion === 'senden',
    })
    if (!issued.ok) {
      console.error('[AAR-956 P3] issueCanonical fehlgeschlagen:', issued.error)
      return json({ ok: true, modus: 'callback', anfrage_id: result.anfrageId }, 200)
    }
    if (payload.aktion === 'senden') {
      return json(
        { ok: true, modus: 'gesendet', kanal: issued.kanal, token: issued.token, anfrage_id: result.anfrageId },
        200,
      )
    }
    return json({ ok: true, modus: 'direkt', token: issued.token, anfrage_id: result.anfrageId }, 200)
  }

  // ── 5. Funnel-Modus-Branch (sv_embed A/B) ────────────────────────────────
  // Variante B (embed_sites.funnel_modus='flowlink', opt-in pro SV): konversion-first
  // INLINE. issueCanonicalFlowLinkForAnfrage macht alles server-seitig — Lead (idempotent),
  // SV-Prenote (gfa.konvertiert_zu_lead_id, /flow liest den Picked-SV), EINEN kanonischen
  // flow_link, + Versand des /flow-Links (WhatsApp -> SMS -> Email). KEINE notifyAnfrage /
  // SV-WhatsApp (Aaron-Entscheidung): SV-Awareness laeuft ueber den Lead + die Dispatcher-
  // Queue. Inline (nicht after()), weil die Response Kanal/Token fuers Widget-Danke traegt.
  if (site?.funnel_modus === 'flowlink') {
    const issued = await issueCanonicalFlowLinkForAnfrage(result.anfrageId)
    if (issued.ok && issued.kanal !== 'none') {
      return json(
        { ok: true, modus: 'flowlink', kanal: issued.kanal, token: issued.token, anfrage_id: result.anfrageId },
        200,
      )
    }
    // Degraded (Fehler ODER kein Kanal erreichbar): kein Link raus -> Callback-Wording.
    // KEIN Notify; gfa + (falls erstellt) Lead haengen in der Dispatch-Queue = Safety-Net.
    if (!issued.ok) console.error('[AAR-939 embed-B] issueCanonical fehlgeschlagen:', issued.error)
    return json({ ok: true, modus: 'callback', anfrage_id: result.anfrageId }, 200)
  }

  // ── 6. Variante A (callback) + Cluster-LP: Notify non-blocking nach Response ─
  after(async () => {
    await notifyAnfrage({ anfrageId: result.anfrageId, payload, variante, site })
    // AAR-956 Cluster-LP: gated kanonischer FlowLink (env SELF_SERVICE_AUTO_ISSUE,
    // default AUS). Nur Cluster-LP — sv_embed hat seinen eigenen Pfad (embed-A/B oben),
    // native laeuft inline ueber den Wizard. issueCanonicalFlowLinkForAnfrage erzeugt
    // Lead (idempotent) + EINEN kanonischen flow_link + Versand des /flow-Links
    // (WhatsApp -> SMS -> Email). Ersetzt das alte /anfrage-self_service_token-Doppel
    // (war issueSelfServiceFlowLink). Fehler non-fatal; Lead haengt als Safety-Net
    // in der Dispatch-Queue (kein Eligibility-Filter mehr: jede Anfrage wird Lead).
    if (process.env.SELF_SERVICE_AUTO_ISSUE === 'true' && payload.source === 'kfz_gutachter_lp') {
      try {
        const issued = await issueCanonicalFlowLinkForAnfrage(result.anfrageId)
        if (!issued.ok) {
          console.error('[aar-956 Cluster-LP] issueCanonical fehlgeschlagen:', issued.error)
        }
      } catch (err) {
        console.error('[aar-956 Cluster-LP] issueCanonical (gated) fehlgeschlagen:', err)
      }
    }
  })

  return json({ ok: true, modus: 'callback', anfrage_id: result.anfrageId }, 200)
}
