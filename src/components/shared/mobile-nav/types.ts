import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export type MobileNavItem = {
  href: string
  label: string
  icon: LucideIcon
  exact?: boolean
  external?: boolean
}

export type MobileNavSection = {
  label?: string
  items: MobileNavItem[]
}

export type MobileNavProps = {
  /** Primaer-Items der Bottom-Pille; max. 4 werden gezeigt (5. Slot = Menue). */
  primary: MobileNavItem[]
  /** Vollstaendige Navigation (gruppiert) fuer die Menue-Sheet. */
  sections: MobileNavSection[]
  /** Sheet-Header-Branding: Logo-Node (optional) + Name-Node. */
  brand: { logo?: ReactNode; name: ReactNode }
  /** Indikator-Slot am Menue-Tab (z.B. Updates-Dot). */
  menuIndicator?: ReactNode
  /** Optionale Badge neben einem Tab-/Nav-Item. */
  renderBadge?: (item: MobileNavItem) => ReactNode
  /** Slot oben in der Sheet (z.B. Updates-Zeile, Schaden-melden-CTA). */
  sheetTop?: ReactNode
  /** Slot unten in der Sheet (z.B. Profil + Abmelden). */
  sheetFooter?: ReactNode
  /** Breakpoint, ab dem die Mobile-Nav ausgeblendet wird (Desktop-Sidebar uebernimmt). */
  hideBreakpoint?: 'md' | 'lg'
  ariaLabel?: string
  /**
   * Optionaler Override: WELCHER href gilt als aktiv. Gesetzt → gewinnt gegen die
   * generische `isNavItemActive`-Pfadableitung; nicht gesetzt (Default) → unveraendertes
   * Verhalten fuer alle bestehenden Portale.
   *
   * Gebraucht, wenn ein Eintrag auf eine Route zeigt, die serverseitig woanders endet:
   * im Kunde-Portal linkt „Mein Fall" auf /kunde/faelle/[id], die kanonische Claim-URL
   * liegt aber unter /kunde/fahrzeuge/[vehId]/schaden/[claimId] (P6/WS H) — ohne Override
   * markiert die Pfadableitung dort „Fahrzeuge" statt „Mein Fall" (Ops-Test #26).
   */
  activeHref?: string | null
}
