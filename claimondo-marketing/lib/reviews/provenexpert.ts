// LIVE ProvenExpert-Bewertungen (api_rating_v2) fuer das Trust-Siegel.
// Server-only (PROVENEXPERT_API_USER/_KEY, kein NEXT_PUBLIC). Echt, nie erfunden
// (UWG §5 / E-E-A-T). Bei fehlenden Credentials / API-Fehler / unplausiblen Werten
// -> null, dann rendert <ProvenExpertSiegel/> NICHTS (keine Phantom-Sterne).
// revalidate 24h — Schwestermodul zu lib/reviews/google-places.ts.
//
// Bewusst NUR die Zahlen (ratingValue/reviewCount): die API liefert zusaetzlich ein
// vorgerendertes `aggregateRating`-HTML-Blob mit eigenen <style>-Regeln und Assets
// von provenexpert.com. Das wird NICHT eingebettet — es braeche das Claimondo-Design
// und wuerde beim Besucher wieder Requests an einen Drittanbieter ausloesen. Wir
// rendern das Siegel selbst; der Server holt die Daten, der Browser sieht nur uns.

const API_URL = 'https://www.provenexpert.com/api_rating_v2.json'

export type ProvenExpertRating = {
  ratingValue: number
  reviewCount: number
}

export async function getProvenExpertRating(): Promise<ProvenExpertRating | null> {
  const user = process.env.PROVENEXPERT_API_USER
  const key = process.env.PROVENEXPERT_API_KEY
  if (!user || !key) return null

  try {
    const auth = Buffer.from(`${user}:${key}`).toString('base64')
    const res = await fetch(API_URL, {
      headers: { Authorization: `Basic ${auth}` },
      next: { revalidate: 86400 },
    })
    if (!res.ok) return null

    const json = (await res.json()) as {
      status?: string
      ratingValue?: number | string
      reviewCount?: number | string
    }
    if (json.status !== 'success') return null

    const ratingValue = Number(json.ratingValue)
    const reviewCount = Number(json.reviewCount)
    // Plausibilitaet: ohne echte Bewertung kein Siegel (0 Reviews = nichts zu zeigen).
    if (!Number.isFinite(ratingValue) || ratingValue <= 0 || ratingValue > 5) return null
    if (!Number.isFinite(reviewCount) || reviewCount < 1) return null

    return { ratingValue, reviewCount }
  } catch {
    return null
  }
}
