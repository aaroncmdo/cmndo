import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Allgemeine Geschaeftsbedingungen | Claimondo',
}

export default function AGBPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      <h1 className="text-3xl font-bold text-[#0D1B3E] mb-8">Allgemeine Geschaeftsbedingungen</h1>

      <div className="prose prose-sm text-[#1E3A5F]/80 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">1. Geltungsbereich</h2>
          <p>Diese Allgemeinen Geschaeftsbedingungen gelten fuer alle Leistungen der Claimondo Plattform im Bereich KFZ-Schadenmanagement. Sie regeln das Verhaeltnis zwischen Claimondo und den Nutzern der Plattform (Geschaedigte, Sachverstaendige, Kanzleien).</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">2. Leistungsbeschreibung</h2>
          <p>Claimondo vermittelt KFZ-Sachverstaendige an Geschaedigte nach Verkehrsunfaellen. Die Plattform uebernimmt die Koordination zwischen Geschaedigtem, Sachverstaendigem und ggf. einer Partnerkanzlei zur Durchsetzung der Schadensersatzansprueche gegenueber der gegnerischen Haftpflichtversicherung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">3. Kosten fuer den Geschaedigten</h2>
          <p>Fuer den Geschaedigten entstehen keine Kosten. Saemtliche Gebuehren (Gutachterkosten, Anwaltskosten) werden gegenueber der gegnerischen Versicherung geltend gemacht. Bei unverschuldeten Unfaellen traegt die gegnerische Versicherung diese Kosten vollstaendig.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">4. Sicherungsabtretung</h2>
          <p>Der Geschaedigte tritt seinen Anspruch auf Erstattung der Gutachterkosten an Claimondo bzw. den beauftragten Sachverstaendigen ab. Claimondo macht diesen Anspruch direkt gegenueber der Versicherung geltend.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">5. Datenschutz</h2>
          <p>Die Verarbeitung personenbezogener Daten erfolgt gemaess unserer <a href="/datenschutz" className="text-[#4573A2] underline">Datenschutzerklaerung</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">6. Haftung</h2>
          <p>Claimondo haftet nicht fuer die fachliche Qualitaet der Gutachten. Die Verantwortung liegt beim beauftragten Sachverstaendigen. Claimondo uebernimmt keine Garantie fuer den Ausgang der Schadensregulierung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">7. Schlussbestimmungen</h2>
          <p>Es gilt deutsches Recht. Gerichtsstand ist Koeln. Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der uebrigen Bestimmungen unberuehrt.</p>
        </section>

        <p className="text-xs text-claimondo-ondo/70 mt-8">Stand: April 2026</p>
      </div>
    </main>
  )
}
