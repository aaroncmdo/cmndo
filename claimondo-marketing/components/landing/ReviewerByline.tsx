import { Shield } from 'lucide-react'
import {
  personSchema, jsonLdScript, SITE_URL, SITE_NAME,
} from '@/lib/seo/jsonld'
import { FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'

// AAR-877: Sichtbare Reviewer-Byline + Person-Schema für YMYL-Marketing-
// Pages (Kfz-Schaden = juristisch/finanziell). Schließt E-E-A-T-Ranking-Cap,
// indem auf jeder zitierfähigen Page eine namentliche Autor-/Reviewer-
// Attribution mit Person-Schema ausgeliefert wird.
//
// Aaron Sprafke (Geschäftsführer & COO) ist namentlicher Reviewer aus den
// FOUNDERS-Konstanten in src/lib/seo/jsonld.ts. LinkedIn-URL als sameAs
// liefert die für Person-Schema nötige externe Identitätsverifikation.

const REVIEWER = {
  name: FOUNDER_AARON_NAME,
  jobTitle: 'Geschäftsführer & COO, Claimondo',
  sameAs: 'https://www.linkedin.com/in/aaronsprafke/',
  image: `${SITE_URL}/brand/team-headset.png`,
} as const

function formatDatum(iso: string): string {
  // 2026-05-13 → 13.05.2026
  const [y, m, d] = iso.split('-')
  return `${d}.${m}.${y}`
}

/**
 * Die Autoren, die `wissen_artikel.author` kennt — gemessen am 28.08.2026:
 * `claimondo-redaktion` (60 Artikel) und `aaron-sprafke` (8). Beide Werte sind auf
 * allen 68 veroeffentlichten Artikeln gesetzt; das Feld wurde bisher nur nie angezeigt.
 *
 * ⚠ Nur eine PERSON bekommt `Person`-Schema. Eine Redaktion ist keine natuerliche
 * Person — ihr ein `Person`-Schema mit `sameAs`-LinkedIn zu geben, waere eine erfundene
 * Identitaet. Sie bekommt deshalb nur die sichtbare Nennung; das schwaechere Signal ist
 * hier das ehrliche.
 */
const AUTOREN: Record<string, { name: string; rolle: string; person: boolean; url?: string }> = {
  'aaron-sprafke': {
    name: FOUNDER_AARON_NAME,
    rolle: 'Geschäftsführer & COO',
    person: true,
    url: `${SITE_URL}/autor/aaron-sprafke`,
  },
  'claimondo-redaktion': {
    name: 'Claimondo-Redaktion',
    rolle: 'Fachredaktion Kfz-Schadenrecht',
    person: false,
  },
}

/**
 * @param datum   ISO-Datum („2026-08-24") — der Stand, den die Seite ausweist.
 * @param rolle   `geprueft` (Default) = „Fachlich geprüft von …". Nur setzen, wenn der
 *                Inhalt tatsaechlich einzeln geprueft wurde.
 *                `verantwortlich` = „Redaktionell verantwortlich: …" — die schwaechere,
 *                aber immer zutreffende Aussage.
 *
 * ⚠ WARUM ES DIESE UNTERSCHEIDUNG GIBT (28.08.2026): Die 175 veroeffentlichten
 * Stadt-Lokalinhalte sind AUSNAHMSLOS `ai_generated = true` und `reviewed_am IS NULL`
 * — kein einziger wurde formal geprueft. „Fachlich geprüft von <Person>" waere dort eine
 * Falschaussage ueber einen namentlich genannten Menschen, und zwar auf ~175 oeffentlichen
 * Seiten. Die Verantwortlichkeits-Variante ist dagegen wahr (der Geschaeftsfuehrer
 * verantwortet die Seite) und liefert dasselbe, was AI-Systeme fuer E-E-A-T lesen:
 * eine benannte Person mit `Person`-Schema und externer Identitaet (LinkedIn `sameAs`).
 *
 * Sobald ein Lokalinhalt `reviewed_am` traegt, darf die Seite auf `geprueft` wechseln.
 */
export function ReviewerByline({
  datum,
  rolle = 'geprueft',
  autor,
}: {
  datum: string
  rolle?: 'geprueft' | 'verantwortlich'
  /** Slug aus `wissen_artikel.author`. Unbekannt oder leer → der Default-Reviewer. */
  autor?: string | null
}) {
  const gewaehlt = (autor && AUTOREN[autor]) || {
    name: REVIEWER.name,
    rolle: REVIEWER.jobTitle.split(', ')[0],
    person: true,
    url: undefined as string | undefined,
  }

  return (
    <>
      {/* Nur fuer eine natuerliche Person. Eine Redaktion bekommt kein Person-Schema —
          das waere eine erfundene Identitaet, und `sameAs` zeigte auf ein LinkedIn-Profil,
          das nicht ihr gehoert. */}
      {gewaehlt.person ? (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={jsonLdScript(
            personSchema({
              name: gewaehlt.name,
              jobTitle: gewaehlt.rolle,
              image: REVIEWER.image,
              sameAs: [REVIEWER.sameAs],
              worksFor: { name: SITE_NAME, url: SITE_URL },
            }),
          )}
        />
      ) : null}
      <aside className="border-t border-claimondo-border/40 bg-white/40">
        <div className="mx-auto flex max-w-3xl flex-col items-center gap-2 px-4 py-5 text-center text-xs text-claimondo-shield sm:flex-row sm:justify-center sm:gap-3 sm:px-6 sm:text-sm">
          <Shield className="h-4 w-4 flex-shrink-0 text-claimondo-ondo" aria-hidden />
          <span>
            {rolle === 'geprueft' ? 'Fachlich geprüft von ' : 'Redaktionell verantwortlich: '}
            {gewaehlt.url ? (
              <a href={gewaehlt.url} className="font-semibold text-claimondo-navy underline-offset-2 hover:underline">
                {gewaehlt.name}
              </a>
            ) : (
              <strong className="font-semibold text-claimondo-navy">{gewaehlt.name}</strong>
            )}
            , {gewaehlt.rolle} · Stand {formatDatum(datum)}
          </span>
        </div>
      </aside>
    </>
  )
}
