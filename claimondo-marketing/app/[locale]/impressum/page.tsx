import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'
import {
  HQ_STREET,
  HQ_POSTAL_CODE,
  HQ_CITY,
  FOUNDER_NICOLAS_NAME,
  FOUNDER_AARON_NAME,
  BETREIBER_NAME,
  BETREIBER_REGISTERGERICHT,
  BETREIBER_HRB,
} from '@/lib/seo/brand-constants'
// Anbieterkennzeichnung nach § 5 DDG traegt dieselbe Nummer wie die CTAs
// (Aaron-Entscheid 21.08.2026). Das Gesetz verlangt eine Nummer, unter der man
// ankommt — keine bestimmte Nummernart. Zwei verschiedene Nummern auf einem
// Auftritt waeren dagegen genau die Inkonsistenz, die der Wechsel abstellt.
import { PHONE_DISPLAY, PHONE_E164 } from '@/lib/seo/jsonld'

export const metadata: Metadata = {
  title: 'Impressum',
  description:
    'Impressum von Claimondo – Anbieterkennzeichnung nach § 5 DDG mit Anschrift, Vertretungsberechtigten und Kontaktdaten.',
  // Eigenes Canonical: ohne dieses erbt die Seite den Layout-Default und
  // erklaerte sich damit zur Kopie der Startseite (= De-Indexierung).
  alternates: { canonical: '/impressum' },
}

export default function ImpressumPage() {
  return (
    <main id="main-content" tabIndex={-1} className="relative min-h-screen bg-claimondo-bg font-[family-name:var(--font-montserrat)]">
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
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Angaben gemäß &sect; 5 DDG</h2>
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

          {/* Betreiber von Website und App. Die Claimondo GmbH ist noch in
              Gruendung und hat deshalb keine Registernummer; betrieben werden
              claimondo.de und app.claimondo.de von der bereits eingetragenen
              Gesellschaft. § 5 DDG verlangt Registergericht und -nummer des
              Diensteanbieters — die kann nur diese liefern. */}
          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Betrieb von Website und App</h2>
            <p>
              Diese Website (claimondo.de) und die Anwendung (app.claimondo.de)
              werden betrieben durch:<br />
              {BETREIBER_NAME}<br />
              {HQ_STREET}<br />
              {HQ_POSTAL_CODE} {HQ_CITY}
            </p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Handelsregister</h2>
            {BETREIBER_REGISTERGERICHT && BETREIBER_HRB ? (
              <p>
                {BETREIBER_NAME}<br />
                {BETREIBER_REGISTERGERICHT}, {BETREIBER_HRB}
              </p>
            ) : (
              /* Solange Registergericht ODER Nummer fehlt, bleibt der bisherige
                 Hinweis stehen. Eine halbe Registerangabe waere schlechter als
                 gar keine — siehe brand-constants.ts. */
              <p>Eintragung in Vorbereitung</p>
            )}
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Umsatzsteuer-Identifikationsnummer</h2>
            <p>In Beantragung</p>
          </div>

          <div>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">Verantwortlich für den Inhalt nach &sect; 18 Abs. 2 MStV</h2>
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
