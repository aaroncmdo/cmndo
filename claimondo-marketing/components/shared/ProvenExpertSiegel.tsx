import { Star } from 'lucide-react'
import { getProvenExpertRating } from '@/lib/reviews/provenexpert'

// ProvenExpert-Trust-Siegel. Self-fetching async Server-Component — holt die LIVE-
// Bewertung (lib/reviews/provenexpert, 24h-cached) und rendert Sterne + Note + Anzahl.
// Bei null (keine Credentials / API-Fehler / 0 Bewertungen) rendert die Komponente
// NICHTS — nie erfundene Bewertungen (UWG §5), analog <GoogleReviews/>.
//
// Warum nicht das offizielle ProSeal-JS-Widget: das laedt s.provenexpert.net im
// Browser des Besuchers (IP-Transfer an einen Dritten) und bringt eigene Styles mit.
// claimondo.de faehrt Consent-Mode v2 mit Default 'denied' — ein ungefragt ladendes
// Drittanbieter-Script wuerde genau diese Architektur untergraben. Hier holt der
// SERVER die Zahlen; der Besucher-Browser kontaktiert ProvenExpert nur, wenn er den
// Profil-Link bewusst anklickt. Gleiche Aussage, kein Datenabfluss, kein Layout-Shift.

const PROFIL_URL =
  'https://www.provenexpert.com/de-de/claimondo/?utm_source=seals&utm_campaign=embedded-proseal&utm_medium=profile'

export async function ProvenExpertSiegel() {
  const data = await getProvenExpertRating()
  if (!data) return null

  const note = data.ratingValue.toFixed(1).replace('.', ',')
  const volle = Math.round(data.ratingValue)

  return (
    <a
      href={PROFIL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mx-auto mt-10 flex w-fit items-center gap-3 rounded-ios-lg border border-claimondo-border/60 bg-white px-4 py-3 transition-colors hover:border-claimondo-ondo/40"
      aria-label={`ProvenExpert: ${note} von 5 Sternen aus ${data.reviewCount} Bewertungen – Profil öffnen`}
    >
      <span className="inline-flex items-center gap-0.5" aria-hidden>
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            className={`h-4 w-4 ${
              i < volle ? 'fill-amber-400 text-amber-400' : 'fill-claimondo-border text-claimondo-border'
            }`}
          />
        ))}
      </span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-semibold text-claimondo-navy">
          {note} von 5 · {data.reviewCount} Bewertungen
        </span>
        <span className="block text-[11px] uppercase tracking-wide text-claimondo-ondo">
          geprüft auf ProvenExpert
        </span>
      </span>
    </a>
  )
}
