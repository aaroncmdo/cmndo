import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Nutzungsbedingungen | Claimondo',
}

export default function NutzungsbedingungenPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      <h1 className="text-3xl font-bold text-[#0D1B3E] mb-8">Nutzungsbedingungen</h1>

      <div className="prose prose-sm text-[#1E3A5F]/80 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">1. Nutzung der Plattform</h2>
          <p>Die Nutzung der Claimondo-Plattform setzt eine Registrierung voraus. Jeder Nutzer ist fuer die Richtigkeit seiner Angaben verantwortlich. Die Zugangsdaten sind vertraulich zu behandeln.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">2. Sachverstaendige</h2>
          <p>Sachverstaendige die ueber Claimondo Auftraege erhalten, verpflichten sich zur fristgerechten und fachgerechten Erstellung der Gutachten. Die Einhaltung der vereinbarten Termine und Qualitaetsstandards ist Voraussetzung fuer die fortlaufende Zusammenarbeit.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">3. Geschaedigte / Kunden</h2>
          <p>Geschaedigte verpflichten sich zur wahrheitsgemaessen Angabe aller schadenrelevanten Informationen. Die Bereitstellung der erforderlichen Dokumente (Fahrzeugschein, Versicherungsdaten, Fotos) ist Voraussetzung fuer die Bearbeitung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">4. Kommunikation</h2>
          <p>Claimondo kommuniziert ueber WhatsApp, E-Mail und das Kundenportal. Mit der Registrierung stimmt der Nutzer dem Erhalt von Nachrichten ueber diese Kanaele zu. Ein Widerruf ist jederzeit moeglich.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">5. Verfuegbarkeit</h2>
          <p>Claimondo bemuecht sich um eine hohe Verfuegbarkeit der Plattform. Wartungsarbeiten werden nach Moeglichkeit vorab angekuendigt. Ein Anspruch auf ununterbrochene Verfuegbarkeit besteht nicht.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">6. Aenderungen</h2>
          <p>Claimondo behaelt sich vor, diese Nutzungsbedingungen jederzeit zu aendern. Nutzer werden ueber wesentliche Aenderungen informiert. Die fortgesetzte Nutzung nach Aenderung gilt als Zustimmung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">7. Verweise</h2>
          <p>
            <a href="/agb" className="text-[#4573A2] underline">Allgemeine Geschaeftsbedingungen</a> |{' '}
            <a href="/datenschutz" className="text-[#4573A2] underline">Datenschutzerklaerung</a> |{' '}
            <a href="/impressum" className="text-[#4573A2] underline">Impressum</a>
          </p>
        </section>

        <p className="text-xs text-gray-400 mt-8">Stand: April 2026</p>
      </div>
    </main>
  )
}
