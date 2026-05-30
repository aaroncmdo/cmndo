// Token-Audit-Skip: next/og ist eine inline-only API (kein Tailwind/CSS-Var-
//   Support). Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// Doc 34 0b.3 — Stadt-OG mit Mini-Karte. Beim Teilen von /kfz-gutachter/<stadt>
// (WhatsApp/LinkedIn/Slack/Twitter) erscheint eine gebrandete Preview mit
// Stadt-Name + USPs + der Live-SV-Karte. Nutzt die ?lat&lng-erweiterte
// Karte-API (0b.3) — STAEDTE haben lat/lng, aber keine einzelne PLZ.
import { ImageResponse } from 'next/og'
import { getStadtBySlug } from '../staedte'
import { SITE_URL } from '@/lib/seo/jsonld'

export const runtime = 'nodejs' // Karte-API-Fetch + Buffer fuer data-URI
// On-demand (kein Build-Zeit-Prerender fuer ~40 Staedte -> keine 40 Fetches
// gegen prod beim Build). Gecrawlt wird die OG selten; die Karte-API cacht
// das PNG serverseitig.
export const dynamic = 'force-dynamic'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'
export const alt = 'Kfz-Gutachter in Ihrer Stadt — Claimondo'

const NAVY = '#0D1B3E'
const NAVY2 = '#15264f'
const ONDO = '#4573A2'
const LIGHT = '#7BA3CC'

const USPS = [
  'Termin in unter 48 Stunden vor Ort',
  '0 € Eigenkosten bei unverschuldetem Unfall',
  'Partnerkanzlei für Verkehrsrecht inklusive',
]

export default async function StadtOgImage({
  params,
}: {
  params: Promise<{ stadt: string }>
}) {
  const { stadt } = await params
  const s = getStadtBySlug(stadt)
  const name = s?.name ?? 'Ihrer Nähe'

  // Karte selbst fetchen -> data-URI im try/catch. Ein Fehler (Karte-API noch
  // nicht deployed, Timeout) bricht die OG NICHT — satori <img> mit kaputtem
  // src wuerde werfen. Dann Fallback: gebrandete Card ohne Karten-Panel.
  let mapDataUri: string | null = null
  if (s) {
    try {
      const r = await fetch(
        `${SITE_URL}/api/v1/karte/${s.slug}.png?lat=${s.lat}&lng=${s.lng}`,
        { signal: AbortSignal.timeout(6000) },
      )
      if (r.ok) {
        const buf = Buffer.from(await r.arrayBuffer())
        mapDataUri = `data:image/png;base64,${buf.toString('base64')}`
      }
    } catch {
      // Fallback unten (kein Karten-Panel).
    }
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200,
          height: 630,
          display: 'flex',
          background: NAVY,
          fontFamily: 'system-ui',
        }}
      >
        {/* Linke Spalte: Brand + Titel + USPs */}
        <div
          style={{
            width: mapDataUri ? 660 : 1200,
            height: 630,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '64px 56px',
            background: `linear-gradient(135deg, ${NAVY} 0%, ${NAVY2} 100%)`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: ONDO, letterSpacing: 3, textTransform: 'uppercase' }}>
              Claimondo
            </span>
            <div style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(123,163,204,0.6)', display: 'flex' }} />
            <span style={{ fontSize: 15, color: 'rgba(123,163,204,0.7)', letterSpacing: 2, textTransform: 'uppercase' }}>
              Gutachter-Suche
            </span>
          </div>

          <div
            style={{
              fontSize: 58,
              fontWeight: 800,
              color: '#ffffff',
              lineHeight: 1.05,
              letterSpacing: -1.5,
              marginBottom: 30,
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            <span>Kfz-Gutachter</span>
            <span style={{ color: LIGHT }}>in {name}</span>
          </div>

          {USPS.map((b) => (
            <div key={b} style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 16 }}>
              <div style={{ width: 12, height: 12, borderRadius: '50%', background: ONDO, display: 'flex', flexShrink: 0 }} />
              <span style={{ fontSize: 23, color: 'rgba(255,255,255,0.95)' }}>{b}</span>
            </div>
          ))}

          <div style={{ display: 'flex', marginTop: 36, fontSize: 16, color: 'rgba(123,163,204,0.85)' }}>
            claimondo.de/gutachter-finden
          </div>
        </div>

        {/* Rechte Spalte: Live-SV-Karte (nur wenn Fetch erfolgreich) */}
        {mapDataUri ? (
          <div style={{ width: 540, height: 630, display: 'flex' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={mapDataUri} width={540} height={630} style={{ objectFit: 'cover' }} alt="" />
          </div>
        ) : null}
      </div>
    ),
    size,
  )
}
