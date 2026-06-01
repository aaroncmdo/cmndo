import Link from 'next/link'
import { getInitials } from '@/lib/initials'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

type AuthorName = 'Kevin Genter' | 'Aaron Sprafke'

const AUTHORS: Record<AuthorName, { jobTitle: string; credentials: string }> = {
  'Kevin Genter': {
    jobTitle: 'Fachanwalt für Verkehrsrecht',
    credentials:
      'Prüft die rechtlichen Aussagen dieses Beitrags auf Aktualität und Belegbarkeit (BGH-/OLG-Rechtsprechung, BaFin-Daten).',
  },
  'Aaron Sprafke': {
    jobTitle: 'Mitgründer & COO, Claimondo',
    credentials: 'Verantwortet die fachliche Gesamtredaktion der Claimondo-Wissensbasis.',
  },
}

interface Props {
  author: AuthorName
  /** Optionaler Override der Standard-Credentials. */
  credentials?: string
  /** Ziel des „Mehr über das Team"-Links (Default: /ueber-uns). */
  ueberMichUrl?: string
}

/**
 * YMYL-konforme Autoren-/Prüfer-Box mit Person-Schema (jobTitle + worksFor).
 * (CONTRACT F-27)
 */
export function AuthorBox({ author, credentials, ueberMichUrl = '/ueber-uns' }: Props) {
  const info = AUTHORS[author]
  const personSchema = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name: author,
    jobTitle: info.jobTitle,
    worksFor: { '@type': 'Organization', name: 'Claimondo' },
    url: `https://claimondo.de${ueberMichUrl}`,
  }
  return (
    <section className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(personSchema) }}
      />
      <div className="flex items-start gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-claimondo-navy text-base font-bold text-white"
          aria-hidden
        >
          {getInitials(author)}
        </div>
        <div>
          <p className="text-[0.75rem] font-bold uppercase tracking-wide text-claimondo-ondo">
            Fachliche Prüfung
          </p>
          <p style={HEAD_FONT} className="mt-0.5 font-extrabold text-claimondo-navy">
            {author}
          </p>
          <p className="text-sm text-claimondo-shield/80">{info.jobTitle}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-claimondo-shield">
            {credentials ?? info.credentials}
          </p>
          <Link
            href={ueberMichUrl}
            className="mt-2 inline-block text-sm font-semibold text-claimondo-ondo hover:underline"
          >
            Mehr über das Team →
          </Link>
        </div>
      </div>
    </section>
  )
}
