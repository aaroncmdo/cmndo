import { Shield } from 'lucide-react'
import {
  personSchema, jsonLdScript, SITE_URL, SITE_NAME,
} from '@/lib/seo/jsonld'
import { FOUNDER_NICOLAS_NAME } from '@/lib/seo/brand-constants'

// AAR-877: Sichtbare Reviewer-Byline + Person-Schema für YMYL-Marketing-
// Pages (Kfz-Schaden = juristisch/finanziell). Schließt E-E-A-T-Ranking-Cap,
// indem auf jeder zitierfähigen Page eine namentliche Autor-/Reviewer-
// Attribution mit Person-Schema ausgeliefert wird.
//
// Nicolas Kitta (CEO & Mitgründer) ist namentlicher Reviewer aus den
// FOUNDERS-Konstanten in src/lib/seo/jsonld.ts. LinkedIn-URL als sameAs
// liefert die für Person-Schema nötige externe Identitätsverifikation.

const REVIEWER = {
  name: FOUNDER_NICOLAS_NAME,
  jobTitle: 'CEO & Mitgründer, Claimondo',
  sameAs: 'https://www.linkedin.com/in/nicolas-kitta-451947246/',
  image: `${SITE_URL}/brand/team-office.jpg`,
} as const

function formatDatum(iso: string): string {
  // 2026-05-13 → 13.05.2026
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

export function ReviewerByline({ datum }: { datum: string }) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={jsonLdScript(
          personSchema({
            name: REVIEWER.name,
            jobTitle: REVIEWER.jobTitle,
            image: REVIEWER.image,
            sameAs: [REVIEWER.sameAs],
            worksFor: { name: SITE_NAME, url: SITE_URL },
          }),
        )}
      />
      <aside className="border-t border-claimondo-border/40 bg-white/40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-5 text-center text-xs text-claimondo-shield sm:flex-row sm:justify-center sm:gap-3 sm:px-6 sm:text-sm">
          <Shield className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
          <span>
            Fachlich geprüft von <strong className="font-semibold text-claimondo-navy">{REVIEWER.name}</strong>, {REVIEWER.jobTitle.split(', ')[0]} · Stand {formatDatum(datum)}
          </span>
        </div>
      </aside>
    </>
  )
}
