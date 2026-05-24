import Link from 'next/link'
import type { RestPage } from '@/lib/rest-types'
import {
  Prose,
  QuickAnswer,
  FaqAccordion,
  Sources,
  ArticleDisclaimer,
  ArticleCta,
} from '@/components/article/parts'

// Shared-Render fuer alle WP-7-Seiten (Pillar/Hub/SF/nested-Artikel). Reused die
// WP-2-Parts (Prose=react-markdown, QuickAnswer, FaqAccordion, Sources,
// Disclaimer, Cta). Eigener route-bewusster Breadcrumb + Header (RestPage hat
// keinen Article-Pillar, sondern eine breadcrumb[]-Liste).

function RestBreadcrumb({ page }: { page: RestPage }) {
  const trail = page.breadcrumb ?? [{ name: 'Start', route: '/' }]
  return (
    <nav aria-label="Brotkrumen" className="container-narrow px-4 pt-6 sm:px-6">
      <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-au-muted">
        {trail.map((c, i) => {
          const last = i === trail.length - 1
          return (
            <li key={c.route + i} className="flex items-center gap-2">
              {last ? (
                <span className="font-semibold text-au-amber-dark">{c.name}</span>
              ) : (
                <>
                  <Link href={c.route} className="transition-colors hover:text-au-amber">
                    {c.name}
                  </Link>
                  <span aria-hidden className="text-au-sand-dark">›</span>
                </>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}

function RestHeader({ page }: { page: RestPage }) {
  const accent = page.h1Accent
  const rest = accent && page.h1.startsWith(accent) ? page.h1.slice(accent.length) : null
  return (
    <header className="mb-10">
      {page.eyebrow ? (
        <div className="mb-4 flex items-center gap-3">
          <span className="h-0.5 w-12 bg-au-amber" aria-hidden />
          <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
            {page.eyebrow}
          </span>
        </div>
      ) : null}
      <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-5xl">
        {rest !== null ? (
          <>
            <span className="font-medium italic text-au-amber">{accent}</span>
            {rest}
          </>
        ) : (
          page.h1
        )}
      </h1>
    </header>
  )
}

export function RestArticle({ page }: { page: RestPage }) {
  return (
    <>
      <RestBreadcrumb page={page} />
      <article className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <RestHeader page={page} />
        <QuickAnswer paragraphs={page.quickAnswer} />
        <Prose markdown={page.body} />
        {page.faq ? <FaqAccordion faq={page.faq} /> : null}
        {page.sources ? <Sources sources={page.sources} /> : null}
        <ArticleDisclaimer />
      </article>
      <ArticleCta />
    </>
  )
}
