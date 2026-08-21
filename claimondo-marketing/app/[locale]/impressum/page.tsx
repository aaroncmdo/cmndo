import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import { HQ_STREET, HQ_POSTAL_CODE, HQ_CITY, FOUNDER_NICOLAS_NAME, FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'
// Anbieterkennzeichnung nach § 5 DDG traegt dieselbe Nummer wie die CTAs
// (Aaron-Entscheid 21.08.2026). Das Gesetz verlangt eine Nummer, unter der man
// ankommt — keine bestimmte Nummernart. Zwei verschiedene Nummern auf einem
// Auftritt waeren dagegen genau die Inkonsistenz, die der Wechsel abstellt.
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Impressum',
  description:
    'Impressum von Claimondo — Anbieterkennzeichnung nach § 5 DDG mit Anschrift, Vertretungsberechtigten und Kontaktdaten.',
  // Eigenes Canonical: ohne dieses erbt die Seite den Layout-Default und
  // erklaerte sich damit zur Kopie der Startseite (= De-Indexierung).
  alternates: { canonical: '/impressum' },
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
        <div className="mb-8">
          <PageHeader title="Impressum" size="lg" />
        </div>

        <section className="rounded-3xl bg-white p-7 sm:p-10 shadow-sheet space-y-7 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Angaben gemäß &sect; 5 TMG</h2>
            <p>
              Claimondo GmbH i.G.<br />
              {HQ_STREET}<br />
              {HQ_POSTAL_CODE} {HQ_CITY}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Vertreten durch</h2>
            <p>Geschäftsführer: {FOUNDER_AARON_NAME}, {FOUNDER_NICOLAS_NAME}</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Kontakt</h2>
            <p>
              E-Mail: <a href="mailto:aaron.sprafke@claimondo.de" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">aaron.sprafke@claimondo.de</a><br />
              Telefon: <a href={`tel:${PHONE_E164}`} className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">{PHONE_DISPLAY}</a>
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
              {FOUNDER_AARON_NAME}<br />
              {HQ_STREET}<br />
              {HQ_POSTAL_CODE} {HQ_CITY}
            </p>
          </div>
        </section>
      </div>
    </main>
  )
}
