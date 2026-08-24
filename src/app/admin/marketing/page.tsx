import Link from 'next/link'
import { SectionCard } from '@/components/shared/SectionCard'
import PageHeader from '@/components/shared/PageHeader'

export default function MarketingPage() {
  return (
    <div className="space-y-6 py-6">
      <PageHeader title="Marketing" description="Automatisierte Kanäle & Freigaben" size="lg" />
      {/* Steht oben, weil es als einziges TAEGLICH angefasst wird (Ziehung). */}
      <Link href="/admin/marketing/gewinnspiel" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Gewinnspiel</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Tägliche Verlosung von Gutscheinen unter Leads mit unverschuldetem Unfall. Kampagne
            und Prämien pflegen, Willkommens-Nachrichten senden, ziehen und Nachweise prüfen.
          </p>
        </SectionCard>
      </Link>
      <Link href="/admin/marketing/linkedin" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">LinkedIn Auto-Posting</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Entwürfe aus dem Wissens-Feed prüfen und auf die Company-Page freigeben.
          </p>
        </SectionCard>
      </Link>
      <Link href="/admin/marketing/lead-reaktivierung" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Lead-Reaktivierung</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Erreichbare, kalt gewordene Leads mit einer einmaligen &bdquo;Schadenmeldung
            abschließen&ldquo;-Mail reaktivieren.
          </p>
        </SectionCard>
      </Link>
      <Link href="/admin/marketing/lokal-content" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Hyperlokale Ortsinhalte</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            Stadtbezirke, Verkehrsachsen, Unfallschwerpunkte und ortsspezifische FAQs für die
            Stadtseiten. KI erstellt den Entwurf, veröffentlicht wird erst nach Freigabe —
            Unfallschwerpunkte nur mit belegbarer Quelle.
          </p>
        </SectionCard>
      </Link>
      <Link href="/admin/marketing/content-studio" className="block">
        <SectionCard className="hover:bg-claimondo-bg/60 transition-colors">
          <h2 className="text-heading-sm font-semibold text-claimondo-navy">Content-Studio</h2>
          <p className="text-body-sm text-claimondo-slate mt-1">
            KI-generierte Kurzvideos (Ratgeber &amp; Ads) für TikTok &amp; Meta — Skript, Voiceover,
            Untertitel und Render vollautomatisch. Vorschau &amp; Download.
          </p>
        </SectionCard>
      </Link>
    </div>
  )
}
