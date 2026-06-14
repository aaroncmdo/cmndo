// Wiederverwendbare gutachter-finden-Section für Marketing-Seiten.
// NICHT zu verwechseln mit dem Monika-Embed (public <script>-Widget, AAR-939):
// dies ist eine INTERNE React-Section, die per Code auf beliebige Marketing-
// Seiten gesetzt wird — Platzierung bestimmt der Entwickler.
//
// Der interaktive Finder ist als <iframe> auf den Haupt-App-Embed eingebettet
// (app.claimondo.de/embed/gutachter-finder). Höhe via `height` (default '100dvh';
// In-Page z.B. "70vh").
//
// AAR-956 WS6: Der Finder lebt jetzt als standalone Embed in der Haupt-App
// (direkter Termin-Engine-Zugriff + Inline-Slot-Booking, das der alte Marketing-
// Finder nie konnte). Diese Section ist nur noch ein iframe-Wrapper. EMBED_ORIGIN
// pro Env (prod -> app.claimondo.de, staging -> app.staging.…) via NEXT_PUBLIC_EMBED_ORIGIN.

const EMBED_ORIGIN = process.env.NEXT_PUBLIC_EMBED_ORIGIN ?? 'https://app.claimondo.de'

type Props = {
  /** Start-Zentrum (z.B. aus ?plz/?stadt server-geocodet). */
  initialCenter?: { lat: number; lng: number } | null
  initialZoom?: number
  /** Container-Höhe (default '100dvh' = Vollseite; In-Page z.B. '70vh'). */
  height?: string
}

export function GutachterFindenSection({
  initialCenter = null,
  initialZoom,
  height = '100dvh',
}: Props) {
  // Das server-geocodete Start-Zentrum als ?lat&lng[&zoom] an den Embed durchreichen
  // → FinderMap zentriert vor + unterdrückt die Geolocation-Abfrage.
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
