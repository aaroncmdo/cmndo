'use client'

import GoogleBusinessFeld from '@/components/GoogleBusinessFeld'
import { SectionCard } from '@/components/shared/SectionCard'

// AAR-956: Darstellung-Section — kunden-sichtbare Verknuepfungen + Branding.
// Extrahiert aus ProfilClient (Task 3 Profil-Rebuild).
export function ProfilDarstellung({
  _svId,
  mapsReady,
}: {
  _svId: string
  mapsReady: boolean
}) {
  return (
    <SectionCard className="p-5 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-4">Wie Kunden Sie sehen</h2>

      {/* AAR-454: Branding-Editor-Verweis (1:1 aus BrandingSection) */}
      <a
        href="/gutachter/profil/branding"
        className="flex items-center justify-between gap-3 p-3 rounded-ios-xl border border-[var(--brand-secondary)]/30 bg-[var(--brand-secondary)]/5 hover:bg-[var(--brand-secondary)]/10 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-[var(--brand-primary)]">Branding-Editor mit Live-Preview</p>
          <p className="text-xs text-claimondo-ondo mt-0.5">
            Logo hochladen — Farben und Schriftart werden automatisch extrahiert.
          </p>
        </div>
        <span className="text-xs font-medium text-[var(--brand-secondary)] whitespace-nowrap">Öffnen →</span>
      </a>

      {/* AAR-956: Google-Business-Profil verknuepfen — erst nach Maps-Load mounten
          (Race-Condition mit lazyOnload-Script vermeiden). */}
      {mapsReady && (
        <div className="mt-4">
          <GoogleBusinessFeld />
        </div>
      )}
    </SectionCard>
  )
}
