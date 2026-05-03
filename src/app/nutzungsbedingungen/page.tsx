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

      <div className="prose prose-sm text-[#1E3A5F]/80 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">1. Nutzung der Plattform</h2>
          <p>Die Nutzung der Claimondo-Plattform setzt eine Registrierung voraus. Jeder Nutzer ist für die Richtigkeit seiner Angaben verantwortlich. Die Zugangsdaten sind vertraulich zu behandeln.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">2. Sachverständige</h2>
          <p>Sachverständige die über Claimondo Aufträge erhalten, verpflichten sich zur fristgerechten und fachgerechten Erstellung der Gutachten. Die Einhaltung der vereinbarten Termine und Qualitätsstandards ist Voraussetzung für die fortlaufende Zusammenarbeit.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">3. Geschädigte / Kunden</h2>
          <p>Geschädigte verpflichten sich zur wahrheitsgemäßen Angabe aller schadenrelevanten Informationen. Die Bereitstellung der erforderlichen Dokumente (Fahrzeugschein, Versicherungsdaten, Fotos) ist Voraussetzung für die Bearbeitung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">4. Kommunikation</h2>
          <p>Claimondo kommuniziert über WhatsApp, E-Mail und das Kundenportal. Mit der Registrierung stimmt der Nutzer dem Erhalt von Nachrichten über diese Kanäle zu. Ein Widerruf ist jederzeit möglich.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">5. Verfügbarkeit</h2>
          <p>Claimondo bemüht sich um eine hohe Verfügbarkeit der Plattform. Wartungsarbeiten werden nach Möglichkeit vorab angekündigt. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">6. Änderungen</h2>
          <p>Claimondo behält sich vor, diese Nutzungsbedingungen jederzeit zu ändern. Nutzer werden über wesentliche Änderungen informiert. Die fortgesetzte Nutzung nach Änderung gilt als Zustimmung.</p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-[#1E3A5F]">7. Verweise</h2>
          <p>
            <a href="/agb" className="text-[#4573A2] underline">Allgemeine Geschäftsbedingungen</a> |{' '}
            <a href="/datenschutz" className="text-[#4573A2] underline">Datenschutzerklärung</a> |{' '}
            <a href="/impressum" className="text-[#4573A2] underline">Impressum</a>
          </p>
        </section>

        <p className="text-xs text-claimondo-ondo/70 mt-8">Stand: April 2026</p>
      </div>
    </main>
  )
}
