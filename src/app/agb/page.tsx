import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Allgemeine Geschäftsbedingungen | Claimondo',
}

export default function AGBPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      <div className="mb-8">
        <PageHeader title="Allgemeine Geschäftsbedingungen" size="lg" />
      </div>

      <div className="prose prose-sm text-[#1E3A5F]/80 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">1. Geltungsbereich</h2>
          <p>Diese Allgemeinen Geschäftsbedingungen gelten für alle Leistungen der Claimondo Plattform im Bereich KFZ-Schadenmanagement. Sie regeln das Verhältnis zwischen Claimondo und den Nutzern der Plattform (Geschädigte, Sachverständige, Kanzleien).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">2. Leistungsbeschreibung</h2>
          <p>Claimondo vermittelt KFZ-Sachverständige an Geschädigte nach Verkehrsunfällen. Die Plattform übernimmt die Koordination zwischen Geschädigtem, Sachverständigem und ggf. einer Partnerkanzlei zur Durchsetzung der Schadensersatzansprüche gegenüber der gegnerischen Haftpflichtversicherung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">3. Kosten für den Geschädigten</h2>
          <p>Für den Geschädigten entstehen keine Kosten. Sämtliche Gebühren (Gutachterkosten, Anwaltskosten) werden gegenüber der gegnerischen Versicherung geltend gemacht. Bei unverschuldeten Unfällen trägt die gegnerische Versicherung diese Kosten vollständig.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">4. Sicherungsabtretung</h2>
          <p>Der Geschädigte tritt seinen Anspruch auf Erstattung der Gutachterkosten an Claimondo bzw. den beauftragten Sachverständigen ab. Claimondo macht diesen Anspruch direkt gegenüber der Versicherung geltend.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">5. Datenschutz</h2>
          <p>Die Verarbeitung personenbezogener Daten erfolgt gemäß unserer <a href="/datenschutz" className="text-[#4573A2] underline">Datenschutzerklärung</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">6. Haftung</h2>
          <p>Claimondo haftet nicht für die fachliche Qualität der Gutachten. Die Verantwortung liegt beim beauftragten Sachverständigen. Claimondo übernimmt keine Garantie für den Ausgang der Schadensregulierung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">7. Schlussbestimmungen</h2>
          <p>Es gilt deutsches Recht. Gerichtsstand ist Köln. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.</p>
        </section>

        <p className="text-xs text-claimondo-ondo/70 mt-8">Stand: April 2026</p>
      </div>
    </main>
  )
}
