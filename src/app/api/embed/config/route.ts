import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { signSiteToken } from '@/lib/embed/jwt'

/**
 * AAR-939 · Monika-Embed · Stream 5 — Config-Endpoint /api/embed/config
 *
 * GET ?site_id=<embed_sites.slug> → liefert dem Widget (sv_embed-Modus) das
 * Theme + ein kurzlebiges Site-Token (1h, HS256). Cross-Origin (CORS *), liest
 * via service_role (kein User-Context auf fremden Domains).
 *
 * Theme-Logik (Stream 0 / Aaron):
 *   • variante A (free) → Claimondo-Default-Theme + brandedByClaimondo=true
 *     (Widget zeigt "powered by Claimondo"-Strip). Site-eigene brand_*_override
 *     werden IGNORIERT (greifen erst bei B), bleiben aber in der DB erhalten.
 *   • variante B (paid) → SV-Whitelabel (sachverstaendige.brand_*) + optionale
 *     embed_sites.brand_*_override (NULL = erbt vom SV) + brandedByClaimondo=false.
 *
 * Sicherheit: baileys_routing_nummer wird NICHT ausgeliefert (nur intern im
 * Webhook). telefon/whatsapp gibt es (noch) nicht als public Spalte auf
 * embed_sites → vorerst null (Widget degradiert sauber). TODO Aaron: entscheiden,
 * ob ein public WA-/Telefon-Feld noetig ist (Variante-A-Success-Deeplink).
 */

export const dynamic = 'force-dynamic'

const CLAIMONDO_DEFAULT = {
  primary: '#0D1B3E', // Navy
  accent: '#4573A2', // Light
  text: '#0F2429', // ink
}
const CLAIMONDO_LOGO = '/brand/logo-mark.svg' // bis siegel-claimondo-partner-v2.svg geliefert ist

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function json(body: unknown, status: number) {
  return NextResponse.json(body, {
    status,
    headers: { ...CORS, 'Cache-Control': 'no-store' },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS })
}

export async function GET(req: NextRequest) {
  const siteId = req.nextUrl.searchParams.get('site_id')
  if (!siteId) return json({ error: 'site_id fehlt' }, 400)

  // embed_sites + sachverstaendige.brand_* sind in der generierten
  // database.types.ts noch nicht enthalten (Types hinken der frischen Stream-1-DB
  // hinterher) → der getypte Query-Builder inferiert `never` fuer das Row-Objekt.
  // Deshalb explizite Row-Typen + Cast der .data direkt nach der Query (Repo-Idiom
  // fuer types-lagging-DB). Sobald generate_typescript_types lief, koennen die Casts weg.
  interface EmbedSiteRow {
    slug: string
    variante: string | null
    aktiv: boolean
    sv_id: string | null
    brand_primary_override: string | null
    brand_secondary_override: string | null
    brand_accent_override: string | null
    brand_logo_url_override: string | null
  }
  interface SvBrand {
    brand_primary: string | null
    brand_accent: string | null
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any
  const siteRes = await db
    .from('embed_sites')
    .select('slug, variante, aktiv, sv_id, brand_primary_override, brand_secondary_override, brand_accent_override, brand_logo_url_override')
    .eq('slug', siteId)
    .maybeSingle()

  if (siteRes.error) {
    console.error('[AAR-939] embed/config load failed:', siteRes.error.message)
    return json({ error: 'lookup_failed' }, 500)
  }
  const site = siteRes.data as EmbedSiteRow | null
  if (!site) return json({ error: 'unknown_site' }, 404)
  if (!site.aktiv) return json({ paused: true }, 200)

  const base = req.nextUrl.origin
  const variante = site.variante ?? 'A'
  const defaultLogo = `${base}${CLAIMONDO_LOGO}` // Widget laeuft cross-origin → absolut

  let theme: {
    primary: string
    accent: string
    text: string
    logoUrl: string
    brandedByClaimondo: boolean
  }

  if (variante === 'B') {
    // SV-Whitelabel als Basis, Site-Override hat Vorrang.
    let svBrand: SvBrand | null = null
    if (site.sv_id) {
      const svRes = await db
        .from('sachverstaendige')
        .select('brand_primary, brand_accent')
        .eq('id', site.sv_id)
        .maybeSingle()
      svBrand = (svRes.data as SvBrand | null) ?? null
    }
    theme = {
      primary: site.brand_primary_override ?? svBrand?.brand_primary ?? CLAIMONDO_DEFAULT.primary,
      accent: site.brand_accent_override ?? svBrand?.brand_accent ?? CLAIMONDO_DEFAULT.accent,
      text: site.brand_secondary_override ?? CLAIMONDO_DEFAULT.text,
      logoUrl: site.brand_logo_url_override ?? defaultLogo,
      brandedByClaimondo: false,
    }
  } else {
    // Variante A: Claimondo-Default erzwingen (Overrides ignorieren)
    theme = {
      primary: CLAIMONDO_DEFAULT.primary,
      accent: CLAIMONDO_DEFAULT.accent,
      text: CLAIMONDO_DEFAULT.text,
      logoUrl: defaultLogo,
      brandedByClaimondo: true,
    }
  }

  const siteToken = await signSiteToken(site.slug)

  return json(
    {
      theme,
      telefon: null, // TODO Aaron: public Telefon-Feld auf embed_sites?
      whatsapp: null, // TODO Aaron: WA-Deeplink-Nummer (nicht baileys_routing_nummer leaken)
      site_token: siteToken,
    },
    200,
  )
}
