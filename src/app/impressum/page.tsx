import type { Metadata } from 'next'

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

      <h1 className="text-3xl font-bold text-[#1E3A5F] mb-8">Impressum</h1>

      <section className="space-y-6 text-[#1E3A5F]/90 leading-relaxed">
        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Angaben gemaess &sect; 5 TMG</h2>
          <p>
            Claimondo GmbH i.G.<br />
            Hansaring 10<br />
            50670 Koeln
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Vertreten durch</h2>
          <p>Geschaeftsfuehrer: Aaron Sprafke, Nicolas Kitta</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Kontakt</h2>
          <p>
            E-Mail: <a href="mailto:support@claimondo.de" className="text-[#4573A2] underline">support@claimondo.de</a><br />
            Telefon: <span className="text-[#1E3A5F]/50">TODO</span>
          </p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Handelsregister</h2>
          <p className="text-[#1E3A5F]/50">TODO (sobald GmbH eingetragen)</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Umsatzsteuer-Identifikationsnummer</h2>
          <p className="text-[#1E3A5F]/50">USt-IdNr.: TODO</p>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-[#1E3A5F] mb-2">Verantwortlich fuer den Inhalt nach &sect; 55 Abs. 2 RStV</h2>
          <p>
            Aaron Sprafke<br />
            Hansaring 10<br />
            50670 Koeln
          </p>
        </div>
      </section>
    </main>
  )
}
