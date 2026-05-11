import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Nutzungsbedingungen | Claimondo',
}

export default function NutzungsbedingungenPage() {
  return (
    <main className="max-w-3xl mx-auto px-6 py-12 font-[family-name:var(--font-montserrat)]">
      <div className="mb-8">
        <PageHeader title="Nutzungsbedingungen" size="lg" />
      </div>

      <div className="prose prose-sm text-claimondo-shield/80 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">1. Nutzung der Plattform</h2>
          <p>Die Nutzung der Claimondo-Plattform setzt eine Registrierung voraus. Jeder Nutzer ist für die Richtigkeit seiner Angaben verantwortlich. Die Zugangsdaten sind vertraulich zu behandeln.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">2. Sachverständige</h2>
          <p>Sachverständige die über Claimondo Aufträge erhalten, verpflichten sich zur fristgerechten und fachgerechten Erstellung der Gutachten. Die Einhaltung der vereinbarten Termine und Qualitätsstandards ist Voraussetzung für die fortlaufende Zusammenarbeit.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">3. Geschädigte / Kunden</h2>
          <p>Geschädigte verpflichten sich zur wahrheitsgemäßen Angabe aller schadenrelevanten Informationen. Die Bereitstellung der erforderlichen Dokumente (Fahrzeugschein, Versicherungsdaten, Fotos) ist Voraussetzung für die Bearbeitung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">4. Kommunikation</h2>
          <p>Claimondo kommuniziert über WhatsApp, E-Mail und das Kundenportal. Mit der Registrierung stimmt der Nutzer dem Erhalt von Nachrichten über diese Kanäle zu. Ein Widerruf ist jederzeit möglich.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">5. Verfügbarkeit</h2>
          <p>Claimondo bemüht sich um eine hohe Verfügbarkeit der Plattform. Wartungsarbeiten werden nach Möglichkeit vorab angekündigt. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">6. Änderungen</h2>
          <p>Claimondo behält sich vor, diese Nutzungsbedingungen jederzeit zu ändern. Nutzer werden über wesentliche Änderungen informiert. Die fortgesetzte Nutzung nach Änderung gilt als Zustimmung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-claimondo-shield">7. Verweise</h2>
          <p>
            <a href="/agb" className="text-claimondo-ondo underline">Allgemeine Geschäftsbedingungen</a> |{' '}
            <a href="/datenschutz" className="text-claimondo-ondo underline">Datenschutzerklärung</a> |{' '}
            <a href="/impressum" className="text-claimondo-ondo underline">Impressum</a>
          </p>
        </section>

        <p className="text-xs text-claimondo-ondo/70 mt-8">Stand: April 2026</p>
      </div>
    </main>
  )
}
