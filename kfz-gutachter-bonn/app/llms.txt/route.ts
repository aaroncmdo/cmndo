import { SITE } from '@/lib/site'
import { CLUSTER, MAIN_CITY } from '@/lib/cluster'
import { GOOGLE_RATING } from '@/lib/content'

// Tech-SEO-Nachtrag (Cowork/Aaron 10.06.): llms.txt — AI-freundliche Kurz-
// beschreibung + Kern-URLs (llmstxt.org-Muster). Dynamisch aus CLUSTER/SITE
// generiert, bleibt mit der Staedteliste synchron. Statisch prerendered.
export const dynamic = 'force-static'

export function GET() {
  const spokes = CLUSTER.cities
    .filter((c) => !c.main)
    .map((c) => `- [Kfz-Gutachter ${c.name}](${SITE.url}/lp/${c.slug}): Unfallgutachten & Vor-Ort-Termine in ${c.name}`)
    .join('\n')

  const body = `# ${SITE.name}

> Unabhängige Kfz-Sachverständige für ${MAIN_CITY.name} und Umgebung (${CLUSTER.region}).
> Gerichtsfeste Unfallgutachten nach BVSK-Standard, Vor-Ort-Begutachtung in
> der Regel binnen 60 Minuten, 24/7 erreichbar. Bei unverschuldetem Unfall zahlt
> die gegnerische Versicherung das Gutachten (§ 249 BGB) — 0 € für Geschädigte.
> Teil des Claimondo-Partnernetzwerks: Gutachten, Mietwagen, Schadensbetreuung
> und Verkehrsanwalt — komplett koordiniert. Google-Bewertung: ${GOOGLE_RATING.value.replace('.', ',')}/5
> aus ${GOOGLE_RATING.gbpReviewCount} Bewertungen.

## Kern-Seiten

- [${SITE.name} — Startseite](${SITE.url}/): Leistungen, Ablauf, Einsatzgebiet ${MAIN_CITY.name}
${spokes}

## Kontakt

- Telefon (24/7): ${CLUSTER.phone.displayNational}
- Betreiber: Kitta & Sprafke UG (haftungsbeschränkt)
- Netzwerk: https://claimondo.de
- Ratgeber: https://autounfall.io/gutachter-ratgeber
`
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
