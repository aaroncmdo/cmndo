'use client'

// AAR-746 (Phase B): Shared Fall-Identity-Header für Admin / SV / Kunde / KB.
// Ersetzt den SV-eigenen FallHeader + die handgerollte Kunde-"Aktueller-Status"-
// Section. Admin bekommt diesen Header neu (war vorher nur in der FallActionBar
// implizit). Claimondo-Tokens only — keine Tailwind-Default-Farben.
//
// Bewusst KEIN FallPhasenPanel-Strip eingebaut: das bleibt separat, weil SV
// den Strip drunter rendert, Admin ihn in der Aside hat und Kunde ihn gar
// nicht braucht. Komposition entscheidet der Aufrufer.

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
  rolle: _rolle,
  backHref,
  backLabel = 'Zurück',
  children,
  className = '',
}: FallIdentityHeaderProps) {
  const hasBack = Boolean(backHref)

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
          </div>
        </div>
        {children && (
          <div className="shrink-0 flex items-center gap-2">{children}</div>
        )}
      </div>
    </div>
  )
}
