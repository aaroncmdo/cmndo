import type { Metadata } from 'next'
import PageHeader from '@/components/shared/PageHeader'

export const metadata: Metadata = {
  title: 'Nutzungsbedingungen | Claimondo',
}

export default function NutzungsbedingungenPage() {
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
          <PageHeader title="Nutzungsbedingungen" size="lg" />
        </div>

        <div className="rounded-3xl bg-white p-7 sm:p-10 shadow-[0_6px_18px_rgba(15,30,68,.07),0_24px_48px_rgba(15,30,68,.06)] space-y-7 text-claimondo-shield/90 leading-relaxed tracking-[-.005em]">
          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">1. Nutzung der Plattform</h2>
            <p>Die Nutzung der Claimondo-Plattform setzt eine Registrierung voraus. Jeder Nutzer ist für die Richtigkeit seiner Angaben verantwortlich. Die Zugangsdaten sind vertraulich zu behandeln.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">2. Sachverständige</h2>
            <p>Sachverständige die über Claimondo Aufträge erhalten, verpflichten sich zur fristgerechten und fachgerechten Erstellung der Gutachten. Die Einhaltung der vereinbarten Termine und Qualitätsstandards ist Voraussetzung für die fortlaufende Zusammenarbeit.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">3. Geschädigte / Kunden</h2>
            <p>Geschädigte verpflichten sich zur wahrheitsgemäßen Angabe aller schadenrelevanten Informationen. Die Bereitstellung der erforderlichen Dokumente (Fahrzeugschein, Versicherungsdaten, Fotos) ist Voraussetzung für die Bearbeitung.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">4. Kommunikation</h2>
            <p>Claimondo kommuniziert über WhatsApp, E-Mail und das Kundenportal. Mit der Registrierung stimmt der Nutzer dem Erhalt von Nachrichten über diese Kanäle zu. Ein Widerruf ist jederzeit möglich.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">5. Verfügbarkeit</h2>
            <p>Claimondo bemüht sich um eine hohe Verfügbarkeit der Plattform. Wartungsarbeiten werden nach Möglichkeit vorab angekündigt. Ein Anspruch auf ununterbrochene Verfügbarkeit besteht nicht.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">6. Änderungen</h2>
            <p>Claimondo behält sich vor, diese Nutzungsbedingungen jederzeit zu ändern. Nutzer werden über wesentliche Änderungen informiert. Die fortgesetzte Nutzung nach Änderung gilt als Zustimmung.</p>
          </section>

          <section>
            <h2 className="text-lg font-bold text-claimondo-navy tracking-[-.018em] mb-2">7. Verweise</h2>
            <p>
              <a href="/agb" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">Allgemeine Geschäftsbedingungen</a> |{' '}
              <a href="/datenschutz" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">Datenschutzerklärung</a> |{' '}
              <a href="/impressum" className="text-claimondo-ondo underline underline-offset-2 hover:text-claimondo-navy transition-colors">Impressum</a>
            </p>
          </section>

          <p className="text-xs text-claimondo-ondo/70 pt-2">Stand: April 2026</p>
        </div>
      </div>
    </main>
  )
}
