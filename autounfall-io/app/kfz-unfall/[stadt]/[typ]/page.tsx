import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getArticleSlugs } from '@/lib/articles'
import { getPseoPage, getPseoParams, pseoFaq, pseoMeta, deNum } from '@/lib/pseo'
import { siteGraph, pseoGraph } from '@/lib/jsonld'
import { JsonLd } from '@/components/JsonLd'

// WP-5 · Programmatic-SEO-Stadtseiten /kfz-unfall/[stadt]/[typ] (20×5 = 100).
// ALLE noindex (Duplicate-Jaccard 0,61 dokumentiert) bis unikater Lokal-Content
// je Stadt freigegeben ist → robots:{ index:false } + NICHT in app/sitemap.ts.
// Nur bekannte Slug-Kombinationen werden gebaut; alles andere → 404.
export const dynamicParams = false

export function generateStaticParams() {
  return getPseoParams()
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ stadt: string; typ: string }>
}): Promise<Metadata> {
  const { stadt, typ } = await params
  const page = getPseoPage(stadt, typ)
  if (!page) return {}
  const meta = pseoMeta(page)
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: `/kfz-unfall/${stadt}/${typ}` },
    // VERBINDLICH (WP-5): noindex bis unikater Lokal-Content. follow bleibt an.
    robots: { index: false, follow: true },
    openGraph: { type: 'article', url: `/kfz-unfall/${stadt}/${typ}`, title: meta.title, description: meta.description },
  }
}

// Typ → passender flacher Artikel (WP-2). Nur gerendert, wenn der Slug existiert
// (build-time-Guard → kein 404).
const RELATED_ARTICLE: Record<string, string> = {
  auffahrunfall: 'auffahrunfall',
  parkplatzunfall: 'parkplatzunfall-schuld',
  spurwechsel: 'spurwechsel-schuld',
  vorfahrtsverletzung: 'anscheinsbeweis-erklaert',
  wildunfall: 'wildunfall',
}

export default async function PseoPage({
  params,
}: {
  params: Promise<{ stadt: string; typ: string }>
}) {
  const { stadt, typ } = await params
  const page = getPseoPage(stadt, typ)
  if (!page) notFound()

  const { city, type } = page
  const meta = pseoMeta(page)
  const faq = pseoFaq(page)
  const ranking = page.isTopType ? 'häufigste' : 'eine der häufigsten'

  const relatedSlug = RELATED_ARTICLE[typ]
  const showRelated = relatedSlug ? getArticleSlugs().includes(relatedSlug) : false

  return (
    <>
      <JsonLd data={siteGraph(pseoGraph(page, meta, faq))} />

      {/* Breadcrumb */}
      <nav aria-label="Brotkrumen" className="container-narrow px-4 pt-6 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2 font-mono text-xs uppercase tracking-widest text-au-muted">
          <li>
            <Link href="/" className="transition-colors hover:text-au-amber">
              Start
            </Link>
          </li>
          <li aria-hidden className="text-au-sand-dark">›</li>
          <li>{city.name}</li>
          <li aria-hidden className="text-au-sand-dark">›</li>
          <li className="font-semibold text-au-amber-dark">{type.label}</li>
        </ol>
      </nav>

      <article className="container-prose px-4 pb-4 pt-8 sm:px-0 lg:pt-10">
        <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
          Sachverständige · {city.name}
        </p>
        <h1 className="mb-4 text-balance font-display text-4xl font-extrabold leading-tight tracking-tight text-au-ink sm:text-5xl">
          {type.label} in <span className="font-medium italic">{city.name}</span> · was Sie tun müssen
        </h1>
        <p className="mb-8 text-lg leading-relaxed text-au-ink-soft">
          {type.label} sind in {city.name} mit <strong>{type.pct}%</strong> die{' '}
          <strong>{ranking}</strong> Unfall-Kategorien. Durchschnittlicher Sachschaden:{' '}
          <strong>{type.schaden}</strong>. Hier erfahren Sie, wie Sie als Geschädigter Ihre Ansprüche
          nach <span className="font-mono">§ 249 BGB</span> sichern und einen unabhängigen
          Sachverständigen einschalten.
        </p>

        {/* Quick-Answer */}
        <div className="my-8 rounded-ios-sm border-l-4 border-au-amber bg-au-paper-warm p-5 sm:p-6">
          <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
            Schnell-Antwort
          </p>
          <p className="text-au-ink">
            Bei einem {type.label} in {city.name} mit Fremdverschulden haben Sie Anspruch auf einen{' '}
            <strong>unabhängigen Kfz-Sachverständigen Ihrer Wahl</strong> (BGH-Az.{' '}
            <span className="font-mono">VI ZR 67/06</span>). Die gegnerische Haftpflichtversicherung
            übernimmt die Kosten nach <span className="font-mono">§ 249 BGB</span>. Im Großraum{' '}
            {city.name} sind <strong>{city.svs} BVSK-zertifizierte Sachverständige</strong> aktiv.
            Anfrage über autounfall.io · Match in 24 Stunden.
          </p>
        </div>

        <div className="article-prose">
          <h2>Was zählt als {type.label}?</h2>
          <p dangerouslySetInnerHTML={{ __html: type.definition }} />

          <h2>
            {type.label} in {city.name} · Zahlen &amp; Fakten
          </h2>
          <table>
            <tbody>
              <tr>
                <th>Kennzahl</th>
                <th>Wert</th>
              </tr>
              <tr>
                <td>Einwohner {city.name}</td>
                <td>{city.einwohner}</td>
              </tr>
              <tr>
                <td>Zugelassene PKW</td>
                <td>{city.pkw}</td>
              </tr>
              <tr>
                <td>Unfälle pro Jahr (gesamt)</td>
                <td>{city.unfaelle}</td>
              </tr>
              <tr>
                <td>{type.label} pro Jahr (geschätzt)</td>
                <td>
                  {deNum(page.typCount)} ({type.pct}%)
                </td>
              </tr>
              <tr>
                <td>Durchschnittsschaden</td>
                <td>{type.schaden}</td>
              </tr>
              <tr>
                <td>BVSK-Sachverständige (Region)</td>
                <td>{city.svs}</td>
              </tr>
              <tr>
                <td>Zuständiges Gericht</td>
                <td>{city.gericht}</td>
              </tr>
            </tbody>
          </table>

          <h2>
            Rechtsrahmen · BGH-Az <span className="font-mono">{type.bgh}</span>
          </h2>
          <p>
            <strong>
              BGH, Az. <span className="font-mono">{type.bgh}</span>
            </strong>{' '}
            · dieses Urteil definiert die zentrale Beweisregel bei {type.label}-Konstellationen. Für
            Geschädigte in {city.name} bedeutet das:{' '}
            <strong>
              Wer mit guter Aktenlage (Sachverständigen-Gutachten + Zeugen + Polizeibericht) arbeitet,
              setzt sich gegen Versicherungs-Kürzungen wesentlich besser durch.
            </strong>{' '}
            Anwalt einschalten über{' '}
            <a href="https://lex-drive.com" rel="noopener" target="_blank">
              LexDrive UG
            </a>{' '}
            verfügbar bei strittigen Quoten.
          </p>

          <h2>Sachverständige in {city.name} finden</h2>
          <p>
            Sie haben das <strong>freie Sachverständigen-Wahlrecht</strong> (BGH-Az.{' '}
            <span className="font-mono">VI ZR 67/06</span>) — die Versicherung darf Ihnen keinen
            Gutachter aufzwingen. Wählen Sie einen <strong>BVSK-zertifizierten</strong>{' '}
            Sachverständigen für höchste Aktenfestigkeit. autounfall.io vermittelt Ihnen in 24h einen
            unabhängigen Gutachter im Großraum {city.name}.
          </p>
          {showRelated ? (
            <p>
              Weiterführend:{' '}
              <Link href={`/${relatedSlug}`}>
                Ratgeber · {type.label} — Schuld, Beweise, Ansprüche
              </Link>
              .
            </p>
          ) : null}
        </div>

        {/* Inline-CTA */}
        <aside className="my-10 rounded-ios-md bg-au-ink p-6 text-au-surface sm:p-8">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-widest text-au-amber-soft">
            Anfrage starten · in 60 Sekunden
          </p>
          <h3 className="mb-3 font-display text-2xl font-extrabold">
            Sachverständigen in {city.name} anfragen
          </h3>
          <p className="mb-5 text-sm text-au-surface/80">
            BVSK-zertifiziert · Match in 24h · bei Fremdverschulden kostenfrei nach § 249 BGB.
            LexDrive-Anwalt einschalten bei Kürzungen.
          </p>
          <Link
            href="/gutachter-finden#anfrage"
            className="inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface transition-opacity hover:opacity-90"
          >
            Anfrage starten
          </Link>
        </aside>

        {/* FAQ */}
        <section className="article-prose">
          <h2>
            FAQ · {type.label} in {city.name}
          </h2>
        </section>
        <div className="mt-4 space-y-3">
          {faq.map((f) => (
            <details key={f.q} className="rounded-ios-md border border-au-sand-dark bg-au-surface p-5">
              <summary className="cursor-pointer font-display text-lg font-bold text-au-ink">
                {f.q}
              </summary>
              <p className="mt-3 leading-relaxed text-au-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>

        <section className="article-prose mt-10">
          <h2>Quellen</h2>
          <ul>
            <li>BVSK-Honorartabelle 2024 · Honorarkorridor V</li>
            <li>BGH-Az. {type.bgh} (höchstrichterliche Rechtsprechung)</li>
            <li>Polizeistatistik {city.name} 2024</li>
            <li>KBA-Statistik · Fahrzeugbestand {city.name}</li>
            <li>BVSK-Verbandsverzeichnis 2024</li>
            <li>§ 249 BGB · § 249 Abs 2 BGB · § 23 GVG</li>
          </ul>
        </section>

        <p className="mt-6 border-l-4 border-au-amber pl-4 text-sm italic text-au-ink-soft">
          In Partnerschaft mit{' '}
          <a href="https://lex-drive.com" rel="noopener" target="_blank" className="font-semibold text-au-ink underline">
            LexDrive UG
          </a>{' '}
          · Partnerkanzlei für Verkehrsrecht. Stand: Mai 2026. Keine individuelle Rechtsberatung — bei
          konkreten Fragen Anwalt konsultieren.
        </p>
        <p className="mt-10 border-t border-au-sand-dark pt-6 text-xs italic text-au-muted">
          Keine Rechtsberatung. Diese Seite ist Teil eines programmatischen SEO-Clusters. Stand: Mai
          2026.
        </p>
      </article>

      {/* Primary CTA */}
      <aside className="border-y border-au-sand-dark bg-au-paper-warm py-10">
        <div className="container-narrow mx-auto max-w-3xl px-4 text-center sm:px-6">
          <p className="mb-3 font-mono text-[11px] font-semibold uppercase tracking-widest text-au-amber-dark">
            Anfrage starten · in 60 Sekunden
          </p>
          <h3 className="mb-4 font-display text-2xl font-extrabold text-au-ink sm:text-3xl">
            Sachverständigen in {city.name} jetzt anfragen
          </h3>
          <p className="mx-auto mb-5 max-w-xl text-sm text-au-ink-soft">
            Bei Fremdverschulden kostenfrei nach <span className="font-mono">§ 249 BGB</span>. Match in
            24 Stunden. BVSK-zertifiziert.
          </p>
          <Link
            href="/gutachter-finden#anfrage"
            className="inline-flex items-center gap-2 rounded-ios-md bg-au-amber px-7 py-3.5 font-semibold text-au-surface shadow-au-md transition-opacity hover:opacity-90"
          >
            Anfrage starten
          </Link>
        </div>
      </aside>
    </>
  )
}
