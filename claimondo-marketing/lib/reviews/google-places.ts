// E1 — LIVE Google-Bewertungen (Place Details) fuer die Home-Trust-Strip.
// Server-only (GOOGLE_PLACES_API_KEY, kein NEXT_PUBLIC). Echt, nie erfunden
// (UWG §5 / E-E-A-T). Bei fehlendem Key / API-Fehler / leerem Ergebnis -> null,
// dann rendert <GoogleReviews/> NICHTS (keine Phantom-Sterne). revalidate 24h.
//
// Place: "Claimondo - KFZ Sachverständiger in 3 Minuten" (kgmid /g/11nhgzgwdj),
// place_id via Find-Place aufgeloest (2026-06-01).

const PLACE_ID = 'ChIJ61KxUyolv0cRF4lS9Rsavys'

export type GoogleReview = {
  author: string
  rating: number
  text: string
  relativeTime: string
}

export type GoogleReviewsData = {
  rating: number
  count: number
  reviews: GoogleReview[]
}

type RawReview = {
  author_name?: string
  rating?: number
  text?: string
  relative_time_description?: string
}

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const key = process.env.GOOGLE_PLACES_API_KEY
  if (!key) return null

  try {
    const url =
      `https://maps.googleapis.com/maps/api/place/details/json?place_id=${PLACE_ID}` +
      `&fields=rating,user_ratings_total,reviews&language=de&reviews_sort=newest&key=${key}`
    const res = await fetch(url, { next: { revalidate: 86400 } })
    if (!res.ok) return null

    const json = (await res.json()) as {
      status?: string
      result?: { rating?: number; user_ratings_total?: number; reviews?: RawReview[] }
    }
    if (json.status !== 'OK' || !json.result) return null

    const r = json.result
    if (typeof r.rating !== 'number' || typeof r.user_ratings_total !== 'number') return null

    const reviews: GoogleReview[] = (r.reviews ?? [])
      .filter((rv) => typeof rv.text === 'string' && rv.text.trim().length > 20 && (rv.rating ?? 0) >= 4)
      .slice(0, 3)
      .map((rv) => ({
        author: (rv.author_name ?? '').trim(),
        rating: Number(rv.rating ?? 5),
        text: (rv.text ?? '').trim(),
        relativeTime: (rv.relative_time_description ?? '').trim(),
      }))

    return { rating: r.rating, count: r.user_ratings_total, reviews }
  } catch {
    return null
  }
}
