import Link from 'next/link'
import { CtaLink } from '@/components/analytics/CtaLink'
import Image from 'next/image'
import Markdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Article } from '@/lib/article-types'
import { SITE } from '@/lib/site'
import { ctaVarianteFuerRoute, ctaHref } from '@/lib/cta/article-cta-varianten'

// Markdown-Renderer (RSC): interne /-Links → next/link, externe → neuer Tab.
const mdComponents: Components = {
  // Defekt-8 (Bing-Site-Scan 14.06.): Body-Markdown mit fuehrendem „# …" rendert
  // sonst ein ZWEITES <h1> neben dem Seitentitel-<h1> (betraf 14 Cluster-Sub-
  // Artikel: /wbw-* + /schmerzensgeld-*). In-Body-„#" auf <h2> demoten -> genau
  // ein <h1> pro Seite. *.generated.ts (Markdown) bleibt unberuehrt.
  h1: ({ node, ...props }) => <h2 {...props} />,
  a({ href, children }) {
    const url = href ?? '#'
    if (url.startsWith('/')) return <Link href={url}>{children}</Link>
    return (
      <a href={url} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    )
  },
}

export function Prose({ markdown }: { markdown: string }) {
  return (
    <div className="article-prose">
      <Markdown remarkPlugins={[remarkGfm]} components={mdComponents}>
        {markdown}
      </Markdown>
    </div>
  )
}

export function ArticleBreadcrumb({ article }: { article: Article }) {
  return (
    <nav aria-label="Brotkrumen" className="container-narrow px-4 pt-6 sm:px-6">
      <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-au-muted">
        <li>
          <Link href="/" className="transition-colors hover:text-au-amber">
            Start
          </Link>
        </li>
        {article.pillar ? (
          <>
            <li aria-hidden className="text-au-sand-dark">›</li>
            <li>
              <Link href={`/${article.pillar.slug}`} className="transition-colors hover:text-au-amber">
                {article.pillar.name}
              </Link>
            </li>
          </>
        ) : null}
        <li aria-hidden className="text-au-sand-dark">›</li>
        <li className="font-semibold text-au-amber-dark">{article.h1Accent ?? article.title}</li>
      </ol>
    </nav>
  )
}

export function ArticleHero({ hero }: { hero: NonNullable<Article['hero']> }) {
  return (
    <figure className="container-narrow px-4 pb-2 pt-6 sm:px-6">
      <Image
        src={hero.src}
        alt={hero.alt}
        width={hero.width}
        height={hero.height}
        priority
        className="mx-auto block w-full max-w-3xl rounded-ios-md border border-au-sand-dark"
      />
    </figure>
  )
}

export function ArticleHeader({ article }: { article: Article }) {
  const accent = article.h1Accent
  const rest = accent && article.h1.startsWith(accent) ? article.h1.slice(accent.length) : null
  return (
    <header className="mb-10">
      <div className="mb-4 flex items-center gap-3">
        <span className="h-0.5 w-12 bg-au-amber" aria-hidden />
        <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
          {article.eyebrow}
        </span>
      </div>
      <h1 className="text-balance font-display text-4xl font-extrabold leading-[1.05] tracking-tight text-au-ink sm:text-5xl">
        {rest !== null ? (
          <>
            <span className="font-medium italic text-au-amber">{accent}</span>
            {rest}
          </>
        ) : (
          article.h1
        )}
      </h1>
      <div className="mt-7 flex flex-wrap items-center gap-3 font-mono text-xs text-au-muted">
        <span>Stand: {SITE.contentStand}</span>
        <span className="text-au-sand-dark">·</span>
        <span>In Partnerschaft mit {SITE.legalReviewer.name}</span>
        {article.readingNote ? (
          <>
            <span className="text-au-sand-dark">·</span>
            <span>{article.readingNote}</span>
          </>
        ) : null}
      </div>
    </header>
  )
}

export function QuickAnswer({ paragraphs }: { paragraphs: string[] }) {
  return (
    <div className="quick-answer mb-8 rounded-ios-md bg-au-ink p-7 text-au-surface sm:p-8">
      <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-soft">
        Quick Answer
      </div>
      <div className="quick-answer-prose text-lg leading-relaxed">
        <Markdown remarkPlugins={[remarkGfm]}>{paragraphs.join('\n\n')}</Markdown>
      </div>
    </div>
  )
}

export function AtAGlance({ items }: { items: NonNullable<Article['atAGlance']> }) {
  return (
    <aside className="mb-10 rounded-ios-md border border-au-sand-dark bg-au-surface p-5 sm:p-6">
      <div className="mb-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-au-ink-soft">
        Auf einen Blick
      </div>
      <div className="flex flex-wrap gap-3 sm:gap-4">
        {items.map((it) => (
          <div key={it.term} className="min-w-[140px] flex-1 border-l-2 border-au-amber py-1 pl-3">
            <div className="font-mono text-[10px] font-bold uppercase tracking-widest text-au-amber-dark">
              {it.term}
            </div>
            <div className="mt-0.5 text-xs text-au-ink-soft">{it.detail}</div>
          </div>
        ))}
      </div>
    </aside>
  )
}

export function FaqAccordion({ faq }: { faq: NonNullable<Article['faq']> }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold text-au-ink">Häufig gestellte Fragen</h2>
      <div className="mt-4 space-y-3">
        {faq.map((f) => (
          <details key={f.q} className="rounded-ios-md border border-au-sand-dark bg-au-surface p-5">
            <summary className="cursor-pointer font-display text-lg font-bold text-au-ink">{f.q}</summary>
            <p className="mt-3 leading-relaxed text-au-ink-soft">{f.a}</p>
          </details>
        ))}
      </div>
    </section>
  )
}

export function Sources({ sources }: { sources: string[] }) {
  return (
    <section className="mt-10">
      <h2 className="font-display text-2xl font-bold text-au-ink">Quellen</h2>
      <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-au-ink-soft">
        {sources.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
    </section>
  )
}

const MONATE_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

export function ArticleDisclaimer() {
  const now = new Date()
  const stand = `${MONATE_DE[now.getMonth()]} ${now.getFullYear()}`
  return (
    <p className="mt-10 border-t border-au-sand-dark pt-6 text-xs italic text-au-muted">
      Keine Rechtsberatung. Die Einordnung hängt vom Einzelfall ab — bei strittiger Lage einen Anwalt
      für Verkehrsrecht einschalten. Inhaltliche Begleitung durch unsere {SITE.legalReviewer.name}. Stand: {stand}.
    </p>
  )
}

// CTA → eigenes Lead-Formular /gutachter-finden (WP-6). KEINE claimondo.de-Links,
// kein tel/WhatsApp (Footprint-Telefon ist Platzhalter, siehe site.ts).
//
// `route` steuert die kontext-abhaengige Variante (lib/cta/article-cta-varianten.ts):
// ohne Prop bleibt es exakt der Bestandstext, /schadenfreiheitsklasse/* bekommt die
// intent-gerechte Fassung + ref-Attribution. Grund: gemessener Intent-Mismatch
// (~60 % der Formular-Besucher kamen aus dem SFK-Cluster, 0 % Conversion).
export function ArticleCta({ route }: { route?: string | null } = {}) {
  const v = ctaVarianteFuerRoute(route)
  return (
    <section className="bg-au-ink py-14 text-au-surface sm:py-20">
      <div className="container-narrow mx-auto max-w-3xl px-4 text-center sm:px-6">
        <h2 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
          {v.h2Pre}{' '}
          <span className="font-medium italic text-au-amber-soft">{v.h2Highlight}</span>
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-au-surface/80">{v.body}</p>
        <p className="mt-5 text-sm font-semibold text-au-amber-soft">{v.trust}</p>
        <div className="mt-7">
          <CtaLink
            href={ctaHref(v)}
            location="artikel-hub"
            className="inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90"
          >
            {v.button}
          </CtaLink>
        </div>
      </div>
    </section>
  )
}
