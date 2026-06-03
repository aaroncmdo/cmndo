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
  type AnfrageVariante,
  type EmbedSiteConfig,
} from '@/lib/embed/anfrage'
import { verifySiteToken } from '@/lib/embed/jwt'
import { issueSelfServiceFlowLink } from '@/lib/self-service/issue-flowlink'

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
  const isEmbedSource = payload.source === 'sv_embed' || payload.source === 'kfz_gutachter_lp'
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

  // ── 4. Insert ────────────────────────────────────────────────────────────
  const result = await insertAnfrage({
    payload,
    variante,
    embedSiteId: site?.id ?? null,
    originDomain: originHost,
  })
  if (!result.ok) {
    console.error('[AAR-939] insertAnfrage failed:', result.error)
    return json({ ok: false, error: 'insert_failed' }, 500)
  }

  // ── 5. Benachrichtigung non-blocking nach Response ───────────────────────
  after(async () => {
    await notifyAnfrage({ anfrageId: result.anfrageId, payload, variante, site })
    // AAR-940 Self-Service: gated FlowLink-Ausgabe (env SELF_SERVICE_AUTO_ISSUE,
    // default AUS). Nur Cluster-LP — sv_embed hat seinen eigenen Pfad (embed-A/B),
    // native laeuft inline ueber den Wizard. Eligibility (Kontakt, nicht promotet)
    // prueft issueSelfServiceFlowLink selbst; Fehler bleiben non-fatal.
    if (process.env.SELF_SERVICE_AUTO_ISSUE === 'true' && payload.source === 'kfz_gutachter_lp') {
      try {
        await issueSelfServiceFlowLink(result.anfrageId)
      } catch (err) {
        console.error('[AAR-940] issueSelfServiceFlowLink (gated) fehlgeschlagen:', err)
      }
    }
  })

  return json({ ok: true, anfrage_id: result.anfrageId }, 200)
}
