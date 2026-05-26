import Link from 'next/link'

// BGH-Authority-Grid (8 Urteile) — wiederverwendbar in Hauptseite,
// Stadt-Pages, /vorteile, /wie-es-funktioniert.
// Princeton-GEO 'Cite Sources' + 'Authoritative Tone': jede Card hat
// Aktenzeichen + Thema + 1-Satz-Wirkung. Volltexte über juris.bundes-
// gerichtshof.de.

const BGH_URTEILE = [
  { az: 'BGH VI ZR 38/22 ff.', titel: 'Werkstattrisiko 2024',  text: '5 Leitentscheidungen 16.01.2024: Werkstattrisiko trägt die Versicherung.', href: '/decoder/werkstatt-netz' },
  { az: 'BGH VI ZR 65/18',     titel: 'UPE-Aufschläge',        text: 'UPE-Aufschläge auch bei fiktiver Abrechnung erstattungsfähig.', href: '/haftpflicht/reparaturkosten' },
  { az: 'BGH VI ZR 174/24',    titel: 'Beilackierung 2025',    text: 'Beilackierungskosten sind erstattungsfähiger Teil des Schadens.', href: '/decoder/reparatur-unwirtschaftlich' },
  { az: 'BGH VI ZR 53/09',     titel: 'Markenwerkstatt-Sätze', text: 'Unter 3 Jahren oder Scheckheft → Stundenverrechnung Markenwerkstatt.', href: '/unverschuldeter-unfall-rechte' },
  { az: 'BGH VI ZR 119/04',    titel: 'Restwert regional',     text: 'Restwertbörsen überregional irrelevant — regionaler Markt zählt.', href: '/haftpflicht/wiederbeschaffungswert' },
  { az: 'BGH VI ZR 357/03',    titel: 'Wertminderung',         text: 'Merkantile Wertminderung auch bei älteren Fahrzeugen.', href: '/haftpflicht/wertminderung' },
  { az: 'BGH VI ZR 67/91',     titel: '130%-Regel',            text: 'Reparatur bis 130 % des Wiederbeschaffungswertes zulässig.', href: null },
  { az: 'BGH VI ZR 280/22',    titel: 'SV-Honorar-Risiko',     text: 'Auch überhöhte SV-Honorare gehen zu Lasten der Versicherung.', href: '/haftpflicht/sv-kosten' },
] as const

type Props = {
  /** Optional: Stadt-spezifischer Subline-Zusatz wie "auch in Köln anwendbar". */
  subline?: string
  /** Optional: aria-labelledby Override (default 'bgh-authority-heading'). */
  headingId?: string
  /** Optional: Headline override. */
  headline?: string
}

export function BghAuthorityGrid({
  subline,
  headingId = 'bgh-authority-heading',
  headline = '8 BGH-Urteile, die Ihre Ansprüche absichern',
}: Props = {}) {
  return (
    <section className="bg-white py-16 sm:py-24" aria-labelledby={headingId}>
      <div className="mx-auto max-w-6xl px-5">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-claimondo-ondo">
            Der BGH stützt Sie
          </p>
          <h2 id={headingId} className="mt-3 text-3xl font-extrabold text-claimondo-navy sm:text-4xl">
            {headline}
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Höchstrichterliche Rechtsprechung von 1992 bis 2025 — Werkstattrisiko, UPE,
            Beilackierung, Wertminderung und 130%-Regel sind seit Jahren BGH-fest.
            {subline ?? ' Versicherer kürzen trotzdem. Wir holen es zurück.'}
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {BGH_URTEILE.map((u) =>
            // Doc 41 §3.3: 7 von 8 Urteilen verlinkt; 130%-Regel (VI ZR 67/91) bewusst
            // ohne Link (§3.1). Option B statt CardLink, damit die AZ-Badge OBEN bleibt
            // (CardLink rendert title-first) — Layout visuell unveraendert (§3.4).
            u.href ? (
              <Link
                key={u.az}
                href={u.href}
                className="group block rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-claimondo-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-claimondo-ondo"
                aria-label={`${u.titel} — ${u.az} im Detail`}
                data-tracking={`card-bgh-${u.az.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}`}
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-claimondo-navy">
                  {u.az}
                </span>
                <h3 className="mt-3 text-base font-bold text-claimondo-navy group-hover:text-claimondo-ondo">{u.titel}</h3>
                <p className="mt-2 text-xs leading-relaxed text-claimondo-shield">{u.text}</p>
                <span className="mt-3 inline-flex items-center gap-1 text-[11px] font-semibold text-claimondo-ondo group-hover:text-claimondo-navy">
                  Im Cluster ansehen →
                </span>
              </Link>
            ) : (
              <article
                key={u.az}
                className="rounded-ios-md border border-claimondo-border bg-claimondo-bg p-5 transition-all hover:-translate-y-0.5 hover:bg-white hover:shadow-claimondo-sm"
              >
                <span className="inline-flex items-center gap-1.5 rounded-full bg-claimondo-navy/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-claimondo-navy">
                  {u.az}
                </span>
                <h3 className="mt-3 text-base font-bold text-claimondo-navy">{u.titel}</h3>
                <p className="mt-2 text-xs leading-relaxed text-claimondo-shield">{u.text}</p>
              </article>
            )
          )}
        </div>
        <p className="mt-10 text-center text-xs text-claimondo-shield/70">
          Quelle: juris.bundesgerichtshof.de — Volltexte über Aktenzeichen abrufbar
        </p>
      </div>
    </section>
  )
}
