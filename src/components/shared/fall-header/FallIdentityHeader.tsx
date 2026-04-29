'use client'

// AAR-746 (Phase B): Shared Fall-Identity-Header für Admin / SV / Kunde / KB.
// CMM-32 Walkthrough: SV-Variant zeigt jetzt Kennzeichen prominent + Kunde
// + Marke/Modell statt Unfallort — der SV identifiziert den Fall vor Ort
// über Kennzeichen, nicht über die Schaden-Adresse.

import Link from 'next/link'
import { ChevronLeftIcon } from 'lucide-react'

export type FallIdentityRolle = 'admin' | 'sv' | 'kunde' | 'kb'

type FallIdentityHeaderProps = {
  fallNummer: string
  kundenName?: string | null
  ort?: string | null
  /** Optional: "Phase 5 Kanzlei-Bearbeitung · Anspruchsschreiben" oder "In Regulierung" */
  subphaseLabel?: string | null
  rolle: FallIdentityRolle
  /** CMM-32 Walkthrough: Kennzeichen (z.B. „K-AB 1234"). Für SV-Variante zentral. */
  kennzeichen?: string | null
  /** CMM-32 Walkthrough: Marke + Modell zusammen, z.B. „BMW 320i". */
  fahrzeug?: string | null
  /** Back-Breadcrumb links (z.B. SV: /gutachter/faelle). Weglassen = kein Link. */
  backHref?: string
  backLabel?: string
  /** Slot für rollenspezifische Actions (TaskAnlegen, Drawer, ...). Rechts platziert. */
  children?: React.ReactNode
  /** Extra Klassen auf dem Wrapper — nur Layout-Zwecke, keine Farb-Overrides. */
  className?: string
}

export function FallIdentityHeader({
  fallNummer,
  kundenName,
  ort,
  subphaseLabel,
  rolle,
  kennzeichen,
  fahrzeug,
  backHref,
  backLabel = 'Zurück',
  children,
  className = '',
}: FallIdentityHeaderProps) {
  const hasBack = Boolean(backHref)
  const istSv = rolle === 'sv'

  return (
    <div
      className={`border-b border-claimondo-border bg-white relative ${className}`}
      role="banner"
    >
      <div className="px-4 sm:px-6 py-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {hasBack && backHref && (
            <Link
              href={backHref}
              className="text-claimondo-ondo hover:text-claimondo-navy mt-0.5 shrink-0 transition-colors"
              aria-label={backLabel}
            >
              <ChevronLeftIcon className="w-5 h-5" />
            </Link>
          )}
          <div className="min-w-0">
            {istSv ? (
              // SV-Variante: Kennzeichen + Kunde prominent, Marke/Modell als Subline
              <>
                <h1 className="flex flex-wrap items-center gap-x-2 gap-y-1 text-base sm:text-lg font-semibold text-claimondo-navy">
                  {kennzeichen && (
                    <span className="inline-flex items-center rounded-md border-2 border-claimondo-navy bg-white px-2 py-0.5 font-mono text-sm tracking-wide text-claimondo-navy">
                      {kennzeichen}
                    </span>
                  )}
                  {kundenName && <span className="truncate">{kundenName}</span>}
                </h1>
                <p className="text-xs text-claimondo-ondo mt-1 truncate">
                  {fahrzeug && <span>{fahrzeug}</span>}
                  {fahrzeug && fallNummer && <span className="mx-1.5">·</span>}
                  <span className="font-mono">{fallNummer}</span>
                  {subphaseLabel && (
                    <>
                      <span className="mx-1.5">·</span>
                      <span>{subphaseLabel}</span>
                    </>
                  )}
                </p>
              </>
            ) : (
              // Default-Variante (Admin/Kunde/KB): Fall-Nr + Kunde + Ort
              <>
                <h1 className="text-base sm:text-lg font-semibold text-claimondo-navy truncate">
                  {fallNummer}
                  {kundenName && (
                    <span className="text-claimondo-ondo"> · {kundenName}</span>
                  )}
                  {ort && <span className="text-claimondo-ondo"> · {ort}</span>}
                </h1>
                {subphaseLabel && (
                  <p className="text-xs text-claimondo-ondo mt-0.5 truncate">
                    {subphaseLabel}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
        {children && (
          <div className="shrink-0 flex items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  )
}
