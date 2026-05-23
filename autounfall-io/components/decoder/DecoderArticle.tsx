import Link from 'next/link'
import type { Decoder, DecoderCtaKind } from '@/lib/decoder-types'
import { SITE } from '@/lib/site'

// HTML-Felder (tldr/brief/sections.html/muster.body) sind kontrollierter Content
// aus decoder_content.py (hrefs umgeschrieben) → dangerouslySetInnerHTML ist ok.
function Html({ html, className }: { html: string; className?: string }) {
  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />
}

const CTA_LABEL: Record<DecoderCtaKind, string> = {
  lex: 'Anwalt einschalten (LexDrive) →',
  gutachter: 'Unabhängigen Gutachter anfragen →',
  checker: 'Kürzungs-Checker öffnen',
  musterbrief: 'Musterbrief nutzen',
}

function CtaButton({ kind }: { kind: DecoderCtaKind }) {
  const label = CTA_LABEL[kind]
  const primary = kind === 'lex' || kind === 'gutachter'
  const cls = primary
    ? 'inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-6 py-3 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90'
    : 'inline-flex items-center gap-2 rounded-ios-md border border-au-surface/40 px-6 py-3 font-semibold text-au-surface transition-colors hover:border-au-amber-soft hover:text-au-amber-soft'
  if (kind === 'lex') {
    return (
      <a href={SITE.legalReviewer.url} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    )
  }
  const href = kind === 'gutachter' ? '/gutachter-finden' : kind === 'checker' ? '/kuerzungs-checker' : '#musterbrief'
  return (
    <Link href={href} className={cls}>
      {label}
    </Link>
  )
}

export function DecoderArticle({ decoder }: { decoder: Decoder }) {
  return (
    <>
      <nav aria-label="Brotkrumen" className="container-narrow px-4 pt-6 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-au-muted">
          <li>
            <Link href="/" className="transition-colors hover:text-au-amber">
              Start
            </Link>
          </li>
          <li aria-hidden className="text-au-sand-dark">›</li>
          <li>
            <Link href="/versicherer-decoder" className="transition-colors hover:text-au-amber">
              Versicherer-Decoder
            </Link>
          </li>
          <li aria-hidden className="text-au-sand-dark">›</li>
          <li className="font-semibold text-au-amber-dark">{decoder.crumbLast}</li>
        </ol>
      </nav>

      <article className="container-prose px-4 pb-16 pt-10 sm:px-0 lg:pt-14">
        <header className="mb-8">
          <div className="mb-4 flex items-center gap-3">
            <span className="h-0.5 w-12 bg-au-amber" aria-hidden />
            <span className="font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
              Versicherer-Decoder · {decoder.cluster}
            </span>
          </div>
          <h1 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight text-au-ink sm:text-4xl">
            {decoder.h1}
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-au-ink-soft">{decoder.lede}</p>
        </header>

        {/* TL;DR / Quick-Answer (zitierfaehig, GEO) */}
        <div className="quick-answer mb-8 rounded-ios-md bg-au-ink p-7 text-au-surface sm:p-8">
          <div className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-soft">
            Kurz erklärt
          </div>
          <Html html={decoder.tldr} className="quick-answer-prose text-lg leading-relaxed" />
        </div>

        {/* Was die Versicherung schreibt */}
        <figure className="mb-8 rounded-ios-md border-l-4 border-au-amber bg-au-paper-warm p-5 sm:p-6">
          <figcaption className="mb-2 font-mono text-[10px] font-semibold uppercase tracking-widest text-au-ink-soft">
            Das schreibt die Versicherung
          </figcaption>
          <Html html={decoder.brief} className="text-au-ink-soft italic leading-relaxed" />
        </figure>

        {/* Sections */}
        <div className="article-prose">
          {decoder.sections.map((s) => (
            <section key={s.h2}>
              <h2>{s.h2}</h2>
              <Html html={s.html} />
            </section>
          ))}
        </div>

        {/* Tabelle */}
        {decoder.table ? (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  {decoder.table.cols.map((c) => (
                    <th
                      key={c}
                      className="border-b border-au-sand-dark bg-au-ink px-3 py-2 text-left font-mono text-[11px] font-semibold uppercase tracking-wide text-au-surface"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {decoder.table.rows.map((row, i) => (
                  <tr key={i}>
                    {row.map((cell, j) => (
                      <td key={j} className="border-b border-au-sand-dark px-3 py-2 text-au-ink-soft">
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {/* Musterbrief */}
        {decoder.muster ? (
          <section id="musterbrief" className="mt-10 scroll-mt-24 rounded-ios-md border border-au-sand-dark bg-au-surface p-6">
            <h2 className="font-display text-xl font-bold text-au-ink">{decoder.muster.h2}</h2>
            <p className="mt-2 text-sm text-au-ink-soft">{decoder.muster.intro}</p>
            <Html
              html={decoder.muster.body}
              className="mt-4 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-4 font-mono text-sm leading-relaxed text-au-ink-soft"
            />
          </section>
        ) : null}

        {/* Weiterlesen */}
        {decoder.next && decoder.next.links.length ? (
          <section className="mt-8 rounded-ios-md bg-au-sand/40 p-5">
            <p className="text-sm font-semibold text-au-ink">{decoder.next.text}</p>
            <ul className="mt-2 space-y-1">
              {decoder.next.links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="text-sm font-medium text-au-amber-dark underline">
                    {l.label} →
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* FAQ */}
        {decoder.faq.length ? (
          <section className="mt-10">
            <h2 className="font-display text-2xl font-bold text-au-ink">Häufig gestellte Fragen</h2>
            <div className="mt-4 space-y-3">
              {decoder.faq.map((f) => (
                <details key={f.q} className="rounded-ios-md border border-au-sand-dark bg-au-surface p-5">
                  <summary className="cursor-pointer font-display text-lg font-bold text-au-ink">{f.q}</summary>
                  <p className="mt-3 leading-relaxed text-au-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        ) : null}

        {decoder.sources ? (
          <p className="mt-10 border-t border-au-sand-dark pt-6 text-xs text-au-muted">
            <strong className="text-au-ink-soft">Quellen:</strong> {decoder.sources} Keine
            Rechtsberatung — Einordnung im Einzelfall. Inhaltliche Begleitung: {SITE.legalReviewer.name}.
          </p>
        ) : null}
      </article>

      {/* CTA */}
      {decoder.cta ? (
        <section className="bg-au-ink py-14 text-au-surface sm:py-20">
          <div className="container-narrow mx-auto max-w-3xl px-4 text-center sm:px-6">
            <h2 className="text-balance font-display text-3xl font-extrabold leading-tight tracking-tight sm:text-4xl">
              {decoder.cta.h}
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-au-surface/80">{decoder.cta.p}</p>
            <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
              {decoder.cta.ctas.map((k) => (
                <CtaButton key={k} kind={k} />
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  )
}
