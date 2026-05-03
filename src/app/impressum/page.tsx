import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Impressum | Claimondo',
}

export default function ImpressumPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      {/* ENTWURF-Banner */}
      <div className="mb-8 rounded-lg bg-red-600 text-white px-4 py-3 text-sm font-semibold">
        ENTWURF &mdash; Diese Seite ist ein Entwurf. Anwalts-Review ausstehend.
      </div>

      <div className="mb-8">
        <PageHeader title="Impressum" size="lg" />
      </div>

      <section className="space-y-6 text-[#1E3A5F]/90 leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Angaben gemäß &sect; 5 TMG</h2>
          <p>
            Claimondo GmbH i.G.<br />
            Hansaring 10<br />
            50670 Köln
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Vertreten durch</h2>
          <p>Geschäftsführer: Aaron Sprafke, Nicolas Kitta</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Kontakt</h2>
          <p>
            E-Mail: <a href="mailto:aaron.sprafke@claimondo.de" className="text-[#4573A2] underline">aaron.sprafke@claimondo.de</a><br />
            Telefon: <a href="tel:+4922116398980" className="text-[#4573A2] underline">+49 221 163 989 80</a>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Handelsregister</h2>
          <p>Eintragung in Vorbereitung</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Umsatzsteuer-Identifikationsnummer</h2>
          <p>In Beantragung</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Verantwortlich für den Inhalt nach &sect; 55 Abs. 2 RStV</h2>
          <p>
            Aaron Sprafke<br />
            Hansaring 10<br />
            50670 Köln
          </p>
        </div>
      </section>
    </main>
  )
}
