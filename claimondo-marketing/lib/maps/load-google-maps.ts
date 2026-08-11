// F4: Singleton-Loader fuer die Google Maps JS API (inkl. places-Library).
// Verhindert den "included multiple times"-Doppel-Load, der auf
// /admin/sachverstaendige/[id] entstand, als SvDetailClient (raw <Script libraries=places>),
// IsochronePreviewMap (loadMaps OHNE places) und GooglePlaceAutocomplete
// (ensureGoogleMapsScript MIT places) je eigenstaendig + mit inkonsistenten Params luden.
// EINE Quelle, EINE URL (immer mit libraries=places = Superset), promise-gecacht.

let loadPromise: Promise<void> | null = null

function mapsReady(): boolean {
  return typeof google !== 'undefined' && !!google.maps?.places
}

/**
 * Laedt die Google Maps JS API genau einmal (inkl. places). Idempotent:
 * wiederholte Aufrufe teilen dieselbe Promise / denselben <script>-Tag.
 * Rejected wenn der Key fehlt oder das Script nicht laedt.
 */
export function loadGoogleMaps(): Promise<void> {
  if (mapsReady()) return Promise.resolve()
  if (loadPromise) return loadPromise

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_KEY
  if (!key) return Promise.reject(new Error('NEXT_PUBLIC_GOOGLE_MAPS_KEY fehlt'))

  loadPromise = new Promise<void>((resolve, reject) => {
    const waitUntilReady = () => {
      const iv = setInterval(() => {
        if (mapsReady()) {
          clearInterval(iv)
          resolve()
        }
      }, 100)
    }

    // Script evtl. schon im DOM (aelterer Loader auf einer anderen Seite) -> nur warten.
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      waitUntilReady()
      return
    }

    const s = document.createElement('script')
    // loading=async ist seit Maerz 2024 Pflicht; libraries=places = Superset fuer alle Consumer.
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&loading=async&v=weekly`
    s.async = true
    s.defer = true
    s.onload = () => waitUntilReady()
    s.onerror = () => {
      loadPromise = null // Retry bei naechstem Aufruf erlauben
      reject(new Error('Google Maps Script konnte nicht geladen werden'))
    }
    document.head.appendChild(s)
  })

  return loadPromise
}
