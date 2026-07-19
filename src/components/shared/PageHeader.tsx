// AAR-727 / AAR-769 Phase 3: Einheitlicher Seiten-Header fuer alle Portale.
// AAR-791: description: ReactNode; useBranding; leadingSlot.
// 2026-07-11 (PageHeader-Floating-Card): Der Start-Header rendert per Default als
// weiche Floating-Card (.page-header-card). `bare` (bzw. align="center") rendert
// wie zuvor ohne Card. `children` erlaubt Hub-Tabs/Untertitel INNERHALB der Card.
// Positionierung (sticky/flex-shrink-0) bleibt beim Consumer.
import { type LucideIcon } from 'lucide-react'
import { type ReactNode } from 'react'

type Props = {
  title: string
  description?: ReactNode
  icon?: LucideIcon
  actions?: ReactNode
  /** `md` (default) fuer Sub-Seiten (18px), `lg` fuer Hub-Seiten (24px). */
  size?: 'md' | 'lg'
  /** Title-Color auf var(--brand-primary) statt navy (Whitelabel-SV). */
  useBranding?: boolean
  /** Slot vor dem Title-Block (Avatar-Kreis, Back-Button). */
  leadingSlot?: ReactNode
  /** `start` (default) linksbuendig, `center` fuer Wizard/Auth (impliziert bare). */
  align?: 'start' | 'center'
  /** Inhalt INNERHALB der Card unter der Titelzeile (z.B. Hub-Tabs + Untertitel). */
  children?: ReactNode
  /** Opt-out: rendert ohne Floating-Card (Auth/Login, in SectionCard verschachtelt). */
  bare?: boolean
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
  children,
  bare = false,
}: Props) {
  const titleSize = size === 'lg' ? 'text-2xl' : 'text-lg'
  const titleColor = useBranding
    ? 'text-[var(--brand-primary,#0D1B3E)]'
    : 'text-claimondo-navy'

  if (align === 'center') {
    return (
      <div className="flex flex-col items-center text-center gap-2" data-page-header>
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
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">{actions}</div>
        ) : null}
      </div>
    )
  }

  const titleRow = (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3 min-w-0 sm:flex-1">
        {leadingSlot}
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            {LucideIconRef ? (
              <LucideIconRef className="w-5 h-5 text-claimondo-ondo shrink-0" />
            ) : null}
            {/* title-Attr: bei langen Namen schneidet `truncate` hart ab (Audit Slice 2,
                z.B. lange Test-Account-Namen) — der native Hover-Tooltip macht den vollen
                Titel wieder lesbar, ohne das Layout (Overflow-Schutz) zu aendern. */}
            <h1 className={`${titleSize} font-semibold ${titleColor} truncate`} title={title}>
              {title}
            </h1>
          </div>
          {description ? (
            <p className="text-sm text-claimondo-ondo">{description}</p>
          ) : null}
        </div>
      </div>
      {actions ? (
        // flex-wrap: bei breiter actions-Payload (Toolbar mit mehreren Buttons) auf schmalen
        // Viewports umbrechen statt horizontal ueberlaufen. shrink-0 haelt die Actions auf
        // Desktop neben dem Titel; auf Mobile stapelt der titleRow (flex-col) -> die Actions
        // bekommen eine volle Zeile, in der die Buttons dann umbrechen. (Portal-Header-Fund.)
        <div className="flex flex-wrap items-center gap-3 shrink-0">{actions}</div>
      ) : null}
    </div>
  )

  const bodyContent = (
    <>
      {titleRow}
      {children ? <div className="mt-3">{children}</div> : null}
    </>
  )

  if (bare) {
    return <div data-page-header>{bodyContent}</div>
  }

  return (
    <div
      data-page-header
      data-page-header-card
      className="page-header-card rounded-ios-lg px-5 py-4"
    >
      {bodyContent}
    </div>
  )
}
