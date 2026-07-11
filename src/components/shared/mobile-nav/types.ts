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
  /** Punkt am Menue-Tab (offene Updates/Tasks). */
  hasUnread?: boolean
  /** Optionale Badge neben einem Tab-/Nav-Item. */
  renderBadge?: (item: MobileNavItem) => ReactNode
  /** Slot oben in der Sheet (z.B. Updates-Zeile, Schaden-melden-CTA). */
  sheetTop?: ReactNode
  /** Slot unten in der Sheet (z.B. Profil + Abmelden). */
  sheetFooter?: ReactNode
  /** Breakpoint, ab dem die Mobile-Nav ausgeblendet wird (Desktop-Sidebar uebernimmt). */
  hideBreakpoint?: 'md' | 'lg'
  ariaLabel?: string
}
