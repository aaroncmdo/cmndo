// AAR-727 / AAR-769 Phase 3: Einheitlicher Seiten-Header für alle
// Portale. Ersetzt das `<div><h1>...</h1><p>...</p>+Actions</div>`-
// Pattern, das vorher in 30+ Seiten leicht abweichend kopiert war.
//
// AAR-791: API erweitert auf
//   - description: ReactNode (statt nur string) — erlaubt Inline-Links
//   - useBranding: Title in `var(--brand-primary)` statt navy (Whitelabel-SVs)
//   - leadingSlot: Node vor dem Title-Block (Avatar-Kreise, Back-Buttons)
//
// Token-Treue: claimondo-navy / claimondo-ondo entsprechen 1:1 den
// Werten in src/lib/design-tokens.ts (navy=#0D1B3E, ondo=#4573A2). Die
// Farben kommen über Tailwind-Klassen statt Primitives, weil das
// Description-Feld jetzt ReactNode ist und ein Inline-Style-Color sich
// schlecht mit verschachtelten Links/Spans verträgt.

import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  /**
   * `md` (default) für Sub-Seiten (18px Titel).
   * `lg` für oberste Hub-Seiten (24px Titel).
   */
  size?: 'md' | 'lg'
  /**
   * Schaltet den Title-Color auf `var(--brand-primary)` statt navy. Für
   * Whitelabel-SV-Pages (Gutachter-Portal mit eigenem Branding) — fällt
   * auf navy zurück, wenn keine CSS-Var gesetzt ist.
   */
  useBranding?: boolean
  /**
   * Optionaler Slot vor dem Title-Block — z.B. Avatar-Kreis (Mitarbeiter-
   * Detail), Back-Button (SV-Detail) oder ähnliche dekorative Elemente.
   */
  leadingSlot?: ReactNode
  /**
   * Ausrichtung. `start` (default) für Standard-Hub-Pages, `center` für
   * Wizard-Steps und Auth-Pages mit zentriertem Card-Layout.
   * Bei `center` rendert leadingSlot ÜBER dem Title (gestapelt) statt links.
   */
  align?: 'start' | 'center'
}

export default function PageHeader({
  title,
  description,
  icon: LucideIconRef,
  actions,
  size = 'md',
  useBranding = false,
  leadingSlot,
  align = 'start',
}: Props) {
  const titleSize = size === 'lg' ? 'text-2xl' : 'text-lg'
  const titleColor = useBranding
    ? 'text-[var(--brand-primary,#0D1B3E)]'
    : 'text-claimondo-navy'

  if (align === 'center') {
    return (
      <div className="flex flex-col items-center text-center gap-2">
        {leadingSlot}
        <div className="flex items-center gap-2 justify-center">
          {LucideIconRef ? (
            <LucideIconRef className="w-5 h-5 text-claimondo-ondo shrink-0" />
          ) : null}
          <h1 className={`${titleSize} font-semibold ${titleColor}`}>{title}</h1>
        </div>
        {description ? (
          <p className="text-sm text-claimondo-ondo max-w-prose">{description}</p>
        ) : null}
        {actions ? (
          <div className="flex items-center gap-3 mt-2">{actions}</div>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        {leadingSlot}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {LucideIconRef ? (
              <LucideIconRef className="w-5 h-5 text-claimondo-ondo shrink-0" />
            ) : null}
            <h1 className={`${titleSize} font-semibold ${titleColor} truncate`}>
              {title}
            </h1>
          </div>
          {description ? (
            <p className="text-sm text-claimondo-ondo">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        <div className="flex items-center gap-3 shrink-0">{actions}</div>
      ) : null}
    </div>
  )
}
