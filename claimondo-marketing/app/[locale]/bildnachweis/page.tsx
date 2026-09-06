import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { BILDNACHWEISE } from '@/lib/bilder/nachweise'

// Bildnachweis fuer die Schadenfotos auf den Fachseiten.
//
// Das ist keine Hoeflichkeit: 25 der 28 Fotos stehen unter CC BY oder CC BY-SA, und
// beide Lizenzen machen die Nennung von Urheber und Lizenz zur BEDINGUNG der Nutzung.
// Ohne diese Seite waere jede Einbindung eine Urheberrechtsverletzung. Die drei
// uebrigen (CC0 / Public domain) stehen freiwillig mit drin, damit die Herkunft
// jedes Bildes an einer Stelle nachlesbar ist.
//
// Eigenes Canonical: ohne das erbt die Seite den Layout-Default und erklaert sich zur
// Kopie der Startseite (De-Indexierung — die Klasse aus #5352).

export const metadata: Metadata = {
  title: 'Bildnachweis',
  description:
    'Herkunft, Urheber und Lizenz der Fotos auf claimondo.de — Schadenbilder und Reparaturaufnahmen von Wikimedia Commons.',
  alternates: { canonical: '/bildnachweis' },
  robots: { index: false, follow: true },
}

export default function BildnachweisPage() {
  const gruppen = [...new Set(BILDNACHWEISE.map((b) => b.gruppe))]

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative min-h-screen bg-claimondo-bg font-[family-name:var(--font-montserrat)]"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: [
            'radial-gradient(60% 50% at 80% 0%, rgba(123,163,204,0.18), transparent 60%)',
            'radial-gradient(50% 50% at 0% 100%, rgba(69,115,162,0.08), transparent 70%)',
          ].join(', '),
        }}
      />

      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mb-8">
          <PageHeader title="Bildnachweis" size="lg" />
        </div>

        <div className="space-y-7 rounded-3xl bg-white p-7 leading-relaxed tracking-[-.005em] text-claimondo-shield/90 shadow-sheet sm:p-10">
          <p>
            Die Schadenbilder und Reparaturaufnahmen auf unseren Fachseiten stammen von Wikimedia Commons.
            Sie zeigen echte Fahrzeugschäden — keine Fälle von Claimondo-Kunden. Urheber und Lizenz jedes
            Bildes stehen unten; bei den Lizenzen CC BY und CC BY-SA ist diese Nennung Bedingung der Nutzung.
          </p>

          {gruppen.map((gruppe) => (
            <section key={gruppe}>
              <h2 className="mb-3 text-lg font-bold tracking-[-.018em] text-claimondo-navy">{gruppe}</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-body-sm">
                  <thead>
                    <tr className="border-b border-claimondo-border text-caption uppercase tracking-wide text-claimondo-shield">
                      <th className="py-2 pr-4 font-semibold">Motiv</th>
                      <th className="py-2 pr-4 font-semibold">Urheber</th>
                      <th className="py-2 pr-4 font-semibold">Lizenz</th>
                      <th className="py-2 font-semibold">Quelle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {BILDNACHWEISE.filter((b) => b.gruppe === gruppe).map((b) => (
                      <tr key={b.datei} className="border-b border-claimondo-border/50 align-top">
                        <td className="py-2 pr-4">{b.datei.replace(/-/g, ' ')}</td>
                        <td className="py-2 pr-4">{b.urheber}</td>
                        <td className="py-2 pr-4 whitespace-nowrap">
                          {b.lizenzUrl ? (
                            <a
                              href={b.lizenzUrl}
                              target="_blank"
                              rel="noopener noreferrer license"
                              className="underline decoration-dotted underline-offset-2"
                            >
                              {b.lizenz}
                            </a>
                          ) : (
                            b.lizenz
                          )}
                        </td>
                        <td className="py-2">
                          <a
                            href={b.quelle}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="underline decoration-dotted underline-offset-2"
                          >
                            Wikimedia Commons
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <section>
            <h2 className="mb-2 text-lg font-bold tracking-[-.018em] text-claimondo-navy">Übrige Bilder</h2>
            <p>
              Alle weiteren Aufnahmen auf claimondo.de — Menschen, Werkstatt-Szenen, Portal-Ansichten — sind
              eigene Produktionen oder lizenzierte Auftragsbilder. Sie zeigen keine echten Schadenfälle und
              keine Claimondo-Kunden.
            </p>
          </section>
        </div>
      </div>
    </main>
  )
}
