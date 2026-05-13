import { Scale, BookOpen } from 'lucide-react'

// BGH-Authority-Grid für Hauptseite + Conversion-Pages.
// 8 BGH-Aktenzeichen mit Aktenzeichen-Text, Wirkung und Quote.
// GEO-Pattern „Cite Sources" + „Authoritative Tone" aus Princeton-Studie 2023.
// Wissensdatenbank §1, §2, §6, §7 — Volltexte siehe juris.bundesgerichtshof.de.

type BghEintrag = {
  az: string
  jahr: string
  thema: string
  wirkung: string
  quote?: string
}

const BGH_URTEILE: BghEintrag[] = [
  {
    az: 'VI ZR 38/22 ff.',
    jahr: '2024',
    thema: 'Werkstattrisiko',
    wirkung: 'Geschädigte tragen kein Risiko für überhöhte oder nicht ausgeführte Werkstattleistungen — die Versicherung haftet.',
    quote: 'Werkstattrisiko ist nicht auf den Geschädigten abwälzbar.',
  },
  {
    az: 'VI ZR 65/18',
    jahr: '2018',
    thema: 'UPE-Aufschläge',
    wirkung: 'UPE-Aufschläge sind auch bei fiktiver Abrechnung erstattungsfähig — Kürzungen über Prüfberichte sind unzulässig.',
  },
  {
    az: 'VI ZR 174/24',
    jahr: '2025',
    thema: 'Beilackierung',
    wirkung: 'Beilackierungskosten gehören auch bei fiktiver Abrechnung zum erstattungsfähigen Schaden.',
  },
  {
    az: 'VI ZR 53/09',
    jahr: '2010',
    thema: 'Markenwerkstatt-Sätze',
    wirkung: 'Stundenverrechnungssätze der Markenwerkstatt gelten bei Fahrzeugen unter 3 Jahren — oder mit lückenlosem Scheckheft.',
  },
  {
    az: 'VI ZR 119/04',
    jahr: '2005',
    thema: 'Restwert regional',
    wirkung: 'Der Restwert bemisst sich am regionalen Markt — überregionale Restwertbörsen-Angebote sind kein Maßstab.',
  },
  {
    az: 'VI ZR 357/03',
    jahr: '2005',
    thema: 'Wertminderung',
    wirkung: 'Merkantile Wertminderung ist auch nach perfekter Reparatur zu erstatten — keine starre Altersgrenze.',
  },
  {
    az: 'VI ZR 67/91',
    jahr: '1992',
    thema: '130%-Regel',
    wirkung: 'Reparatur bis 130 % des Wiederbeschaffungswertes ist zulässig — wenn fachgerecht und 6 Monate weitergenutzt.',
  },
  {
    az: 'VI ZR 280/22',
    jahr: '2023',
    thema: 'Sachverständigenrisiko',
    wirkung: 'Auch ein zu teures Sachverständigenhonorar geht zu Lasten der gegnerischen Versicherung — nicht des Geschädigten.',
  },
]

export function BghAuthoritySection() {
  return (
    <section
      className="relative bg-claimondo-bg py-20 sm:py-24"
      aria-labelledby="bgh-authority-heading"
    >
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-claimondo-ondo/30 bg-white px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-claimondo-ondo">
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            Höchstrichterliche Rechtsprechung
          </div>
          <h2
            id="bgh-authority-heading"
            className="mt-5 text-3xl font-extrabold tracking-tight text-claimondo-navy sm:text-4xl"
          >
            8 BGH-Urteile, die für Sie sprechen
          </h2>
          <p className="mt-4 text-base leading-relaxed text-claimondo-shield">
            Die Rechtsprechung des Bundesgerichtshofs schützt unverschuldet Geschädigte
            umfassend. Versicherer kürzen trotzdem — aber jede dieser Kürzungen ist
            angreifbar. Wir und unsere Partnerkanzlei {''}
            <a
              href="https://lexdrive.de/"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-claimondo-ondo underline-offset-4 hover:underline"
            >
              LexDrive
            </a>{' '}
            führen Ihre Ansprüche mit Berufung auf diese Urteile durch.
          </p>
        </div>

        <ul
          className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          role="list"
        >
          {BGH_URTEILE.map((u) => (
            <li
              key={u.az}
              className="group flex flex-col rounded-2xl border border-claimondo-border bg-white p-5 shadow-claimondo-sm transition-all hover:-translate-y-0.5 hover:shadow-claimondo-md"
            >
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-claimondo-ondo/10">
                  <Scale className="h-4 w-4 text-claimondo-ondo" aria-hidden />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
                    BGH {u.jahr}
                  </div>
                  <div className="text-xs font-bold text-claimondo-navy">
                    {u.az}
                  </div>
                </div>
              </div>
              <h3 className="mt-4 text-base font-bold text-claimondo-navy">
                {u.thema}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-claimondo-shield">
                {u.wirkung}
              </p>
              {u.quote && (
                <blockquote className="mt-3 border-l-2 border-claimondo-ondo/40 pl-3 text-xs italic leading-relaxed text-claimondo-shield/90">
                  „{u.quote}"
                </blockquote>
              )}
            </li>
          ))}
        </ul>

        <p className="mt-10 text-center text-xs text-claimondo-shield/70">
          Quelle: juris.bundesgerichtshof.de · Aktenzeichen verlinkbar auf Anfrage
        </p>
      </div>
    </section>
  )
}
