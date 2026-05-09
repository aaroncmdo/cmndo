// Server-Komponente fuer die 4 Legal-Routes (/agb /datenschutz /impressum
// /nutzungsbedingungen).
//
// 2026-05-09 Frontend-Audit: Editorial Long-Read-Layout
//   - LandingTopbar + LandingFooter (vorher pages-naked ohne Navigation)
//   - Glass-Header mit Spotlights und Montserrat-Title
//   - Sticky ToC-Sidebar auf Desktop (rechts), aus H2-Headings extrahiert
//   - Anchor-IDs auf jedem H2/H3 fuer Deep-Linking aus AI-Antworten
//   - Lesbare Spalten-Breite (max-w-2xl Body) + grosszuegige Typo-Hierarchie

import { LandingTopbar } from '@/components/landing/LandingTopbar'
import { LandingFooter } from '@/components/landing/LandingFooter'
import { getLegalDoc, type LegalDocSlug } from '@/lib/legal/get-doc'
import LegalDocBody from './LegalDocBody'

// Headings aus Markdown extrahieren (## und ###). Slug analog zu LegalDocBody.
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[äÄ]/g, 'ae').replace(/[öÖ]/g, 'oe').replace(/[üÜ]/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60)
}

type Heading = { level: 2 | 3; text: string; id: string }

function extractHeadings(markdown: string): Heading[] {
  const out: Heading[] = []
  const re = /^(#{2,3})\s+(.+)$/gm
  let m: RegExpExecArray | null
  while ((m = re.exec(markdown))) {
    const level = m[1].length === 2 ? 2 : 3
    const text = m[2].trim()
    out.push({ level: level as 2 | 3, text, id: slugify(text) })
  }
  return out
}

export default function LegalDocPage({ slug }: { slug: LegalDocSlug }) {
  const doc = getLegalDoc(slug)
  const headings = extractHeadings(doc.markdown)
  const showToc = headings.filter((h) => h.level === 2).length >= 3

  return (
    <div className="min-h-screen" style={{ background: '#f8f9fb' }}>
      <LandingTopbar authenticatedUser={null} />

      {/* Glass-Header mit Spotlights — analog zu FAQ/Vorteile */}
      <section className="relative isolate overflow-hidden py-14 sm:py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{
            background: [
              'radial-gradient(circle at 18% 12%, rgba(123,163,204,0.18), transparent 50%)',
              'radial-gradient(circle at 82% 30%, rgba(69,115,162,0.10), transparent 45%)',
            ].join(', '),
          }}
        />
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/60 bg-white/70 px-3.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-claimondo-ondo backdrop-blur-md">
            Rechtliches
          </div>
          <h1
            className="text-balance text-3xl font-bold leading-[1.1] tracking-[-0.02em] text-claimondo-navy sm:text-4xl md:text-5xl"
            style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
          >
            {doc.titel}
          </h1>
        </div>
      </section>

      {/* Body-Layout: Optional sticky ToC links auf Desktop */}
      <main className="mx-auto max-w-6xl px-5 pb-20 sm:px-6">
        <div className={showToc ? 'flex flex-col gap-10 lg:flex-row lg:items-start' : ''}>
          {showToc && (
            <aside className="lg:sticky lg:top-24 lg:w-60 lg:shrink-0">
              <details className="lg:open" open>
                <summary
                  className="cursor-pointer rounded-2xl border border-white/60 bg-white/70 px-4 py-2.5 text-sm font-semibold text-claimondo-navy backdrop-blur-md lg:cursor-default lg:list-none lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none"
                  style={{ fontFamily: 'Montserrat, system-ui, sans-serif' }}
                >
                  Inhaltsverzeichnis
                </summary>
                <nav className="mt-3 lg:mt-4">
                  <ul className="space-y-1.5 text-[13px] leading-snug">
                    {headings
                      .filter((h) => h.level === 2)
                      .map((h) => (
                        <li key={h.id}>
                          <a
                            href={`#${h.id}`}
                            className="block rounded-lg px-3 py-1.5 text-claimondo-ondo transition-colors hover:bg-claimondo-navy/5 hover:text-claimondo-navy"
                          >
                            {h.text}
                          </a>
                        </li>
                      ))}
                  </ul>
                </nav>
              </details>
            </aside>
          )}

          <article
            className="flex-1 rounded-3xl border border-white/60 bg-white/75 p-6 text-sm shadow-[0_4px_20px_rgba(13,27,62,0.06)] backdrop-blur-md sm:p-10"
            style={{ WebkitBackdropFilter: 'blur(14px)', maxWidth: '720px' }}
          >
            <LegalDocBody markdown={doc.markdown} />
            <p
              className="mt-10 border-t border-claimondo-border/60 pt-6 text-xs text-claimondo-ondo/70"
            >
              Stand: {new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long' })} ·
              Claimondo GmbH, Hansaring 10, 50670 Köln
            </p>
          </article>
        </div>
      </main>

      <LandingFooter />
    </div>
  )
}
