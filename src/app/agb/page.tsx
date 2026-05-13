import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Allgemeine Geschäftsbedingungen | Claimondo',
}

export default function AGBPage() {
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
          <PageHeader title="Allgemeine Geschäftsbedingungen" size="lg" />
        </div>

        <div className="rounded-3xl bg-white p-7 sm:p-10 shadow-sheet space-y-7 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">1. Geltungsbereich</h2>
            <p>Diese Allgemeinen Geschäftsbedingungen gelten für alle Leistungen der Claimondo Plattform im Bereich KFZ-Schadenmanagement. Sie regeln das Verhältnis zwischen Claimondo und den Nutzern der Plattform (Geschädigte, Sachverständige, Kanzleien).</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">2. Leistungsbeschreibung</h2>
            <p>Claimondo vermittelt KFZ-Sachverständige an Geschädigte nach Verkehrsunfällen. Die Plattform übernimmt die Koordination zwischen Geschädigtem, Sachverständigem und ggf. einer Partnerkanzlei zur Durchsetzung der Schadensersatzansprüche gegenüber der gegnerischen Haftpflichtversicherung.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">3. Kosten für den Geschädigten</h2>
            <p>Für den Geschädigten entstehen keine Kosten. Sämtliche Gebühren (Gutachterkosten, Anwaltskosten) werden gegenüber der gegnerischen Versicherung geltend gemacht. Bei unverschuldeten Unfällen trägt die gegnerische Versicherung diese Kosten vollständig.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">4. Sicherungsabtretung</h2>
            <p>Der Geschädigte tritt seinen Anspruch auf Erstattung der Gutachterkosten an Claimondo bzw. den beauftragten Sachverständigen ab. Claimondo macht diesen Anspruch direkt gegenüber der Versicherung geltend.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">5. Datenschutz</h2>
            <p>Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer <a href="/datenschutz" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">Datenschutzerklärung</a>.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">6. Haftung</h2>
            <p>Claimondo haftet nicht für die fachliche Qualität der Gutachten. Die Verantwortung liegt beim beauftragten Sachverständigen. Claimondo übernimmt keine Garantie für den Ausgang der Schadensregulierung.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">7. Schlussbestimmungen</h2>
            <p>Es gilt deutsches Recht. Gerichtsstand ist Köln. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
          </section>

          <p className="text-xs text-claimondo-ondo/70 pt-2">Stand: April 2026</p>
        </div>
      </div>
    </main>
  )
}
