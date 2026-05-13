import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Impressum | Claimondo',
}

export default function ImpressumPage() {
  return (
    <main className="relative min-h-screen bg-claimondo-bg font-[family-name:var(--font-montserrat)]">
      {/* Ambient-Gradient */}
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

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* ENTWURF-Banner */}
        <div className="mb-8 rounded-2xl border border-amber-200/80 bg-amber-50/90 px-5 py-3.5 text-sm font-semibold text-amber-900 shadow-claimondo-md backdrop-blur-sm">
          ENTWURF &mdash; Diese Seite ist ein Entwurf. Anwalts-Review ausstehend.
        </div>

        <div className="mb-8">
          <PageHeader title="Impressum" size="lg" />
        </div>

        <section className="rounded-3xl bg-white p-7 sm:p-10 shadow-sheet space-y-7 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Angaben gemäß &sect; 5 TMG</h2>
            <p>
              Claimondo GmbH i.G.<br />
              Hansaring 10<br />
              50670 Köln
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Vertreten durch</h2>
            <p>Geschäftsführer: Aaron Sprafke, Nicolas Kitta</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Kontakt</h2>
            <p>
              E-Mail: <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">aaron.sprafke@claimondo.de</a><br />
              Telefon: <a href="tel:+4922116398980" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">+49 221 163 989 80</a>
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Handelsregister</h2>
            <p>Eintragung in Vorbereitung</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Umsatzsteuer-Identifikationsnummer</h2>
            <p>In Beantragung</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Verantwortlich für den Inhalt nach &sect; 55 Abs. 2 RStV</h2>
            <p>
              Aaron Sprafke<br />
              Hansaring 10<br />
              50670 Köln
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
