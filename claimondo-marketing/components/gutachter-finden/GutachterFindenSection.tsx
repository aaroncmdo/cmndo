// Wiederverwendbare gutachter-finden-Section für Marketing-Seiten.
// NICHT zu verwechseln mit dem Monika-Embed (public <script>-Widget, AAR-939):
// dies ist eine INTERNE React-Section, die per Code auf beliebige Marketing-
// Seiten gesetzt wird — Platzierung bestimmt der Entwickler.
//
//   variant='full'   -> der interaktive Finder, eingebettet als <iframe> auf den
//                       Haupt-App-Embed (app.claimondo.de/embed/gutachter-finder).
//                       Höhe via `height` (default '100dvh'; In-Page z.B. "70vh").
//   variant='teaser' -> kompakter PLZ/Stadt-Finder, CTA -> volle Seite (vorzentriert).
//
// AAR-956 WS6: Der Finder lebt jetzt als standalone Embed in der Haupt-App
// (direkter Termin-Engine-Zugriff + Inline-Slot-Booking, das der alte Marketing-
// Finder nie konnte). Diese Section ist nur noch ein iframe-Wrapper + der Teaser.
// EMBED_ORIGIN pro Env (prod -> app.claimondo.de, staging -> app.staging.…) via
// NEXT_PUBLIC_EMBED_ORIGIN.

import { GutachterFindenTeaser } from './GutachterFindenTeaser'

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

type Props = {
  variant?: 'full' | 'teaser'
  /** full: Start-Zentrum (z.B. aus ?plz/?stadt server-geocodet). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** full: Container-Höhe (default '100dvh' = Vollseite; Section z.B. '78vh'). */
  height?: string
  /** teaser: Copy-Overrides. */
  eyebrow?: string
  heading?: string
  subline?: string
}

export function GutachterFindenSection({
  variant = 'full',
  initialCenter = null,
  initialZoom,
  height = '100dvh',
  eyebrow,
  heading,
  subline,
}: Props) {
  if (variant === 'teaser') {
    return <GutachterFindenTeaser eyebrow={eyebrow} heading={heading} subline={subline} />
  }

  // full: das server-geocodete Start-Zentrum als ?lat&lng[&zoom] an den Embed
  // durchreichen → FinderMap zentriert vor + unterdrückt die Geolocation-Abfrage.
  const params = new URLSearchParams()
  if (initialCenter) {
    params.set('lat', String(initialCenter.lat))
    params.set('lng', String(initialCenter.lng))
    if (initialZoom) params.set('zoom', String(initialZoom))
  }
  const qs = params.toString()
  const src = `${EMBED_ORIGIN}/embed/gutachter-finder${qs ? `?${qs}` : ''}`

  return (
    <iframe
      src={src}
      title="Kfz-Gutachter in Ihrer Nähe finden"
      loading="lazy"
      allow="geolocation"
      style={{ width: '100%', height, border: 'none', display: 'block' }}
    />
  )
}
