'use client'

// AAR-956 WS2 — Anonymes SV-Profil-Popup, geöffnet ÜBER dem Pin (Mapbox anchor:'bottom').
// View-only: KEIN Wizard-CTA mehr (Buchung läuft über den 3-Step-Wizard, WS4; den SV
// wählt das System anhand des Schadenorts, WS3). Zeigt nur anonyme Aggregate — Region,
// echte Google-Bewertung (GoogleBewertungBadge aus google_bewertungen_cache) + Top-3-
// Spezialisierungen. KEINE PII (kein Firmenname/Adresse/Telefon/Name).
//
// Wird via createRoot in den Mapbox-Popup-Container gerendert (Pattern wie
// DispatchKarteClient). Eigenes File ohne Token-Audit-Skip → token-konform erzwungen.

import GoogleBewertungBadge from '@/components/shared/GoogleBewertungBadge'
import type { AktiverSVPublic } from '@/lib/actions/gutachter-finder-actions'

export function SvProfilePopup({ sv }: { sv: AktiverSVPublic }) {
  const stadt = sv.stadt ?? 'Ihrer Region'
  const initiale = sv.vorname_initiale ?? '·'
  const hatBewertung = sv.bewertungs_durchschnitt !== null && sv.bewertungs_anzahl !== null

  return (
    <div className="min-w-[238px] max-w-[280px] px-1 py-0.5">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-claimondo-ondo text-body font-extrabold text-white">
          {initiale}
        </div>
        <div className="min-w-0">
          <div className="text-body-sm font-bold leading-tight text-claimondo-navy">
            Sachverständiger in {stadt}
          </div>
          <div className="mt-0.5 text-caption font-medium text-claimondo-ondo/70">
            zertifiziert · BVSK
          </div>
        </div>
      </div>

      {hatBewertung && (
        <div className="mt-3">
          <GoogleBewertungBadge
            durchschnitt={sv.bewertungs_durchschnitt}
            anzahl={sv.bewertungs_anzahl}
            size="md"
          />
        </div>
      )}

      {sv.spezifikationen_top3.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {sv.spezifikationen_top3.map((s) => (
            <span
              key={s}
              className="rounded-ios-sm bg-claimondo-bg px-2 py-1 text-caption font-semibold text-claimondo-navy"
            >
              {s}
            </span>
          ))}
        </div>
      )}

      <p className="mt-3 text-caption leading-relaxed text-claimondo-ondo/60">
        Verifizierter Claimondo-Partner — passend zu Ihrem Schadenort vorgeschlagen.
      </p>
    </div>
  )
}
