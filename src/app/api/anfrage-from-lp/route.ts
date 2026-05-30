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
 *   3. Rate-Limit (check_gfa_rate_limit RPC, pro IP-Hash) — Reuse Native-Funnel
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
      // Fail-open — Verfuegbarkeit > Rate-Limit-Strenge (wie Native-Funnel)
    } else if (allowed === false) {
      return json({ ok: false, error: 'rate_limited' }, 429)
    }
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
  })

  return json({ ok: true, anfrage_id: result.anfrageId }, 200)
}
