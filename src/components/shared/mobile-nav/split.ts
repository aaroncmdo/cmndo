import type { MobileNavItem } from './types'

/** Hoechstens 4 Primaer-Tabs; der 5. Slot ist immer der Menue-Tab. */
export function barItems(primary: MobileNavItem[]): MobileNavItem[] {
  return primary.slice(0, 4)
}

/** Aktiv-Zustand einer Route (exact = strikt, sonst Prefix). */
export function isNavItemActive(
  item: { href: string; exact?: boolean },
  pathname: string | null,
): boolean {
  if (!pathname) return false
  if (item.exact) return pathname === item.href
  return pathname === item.href || pathname.startsWith(item.href + '/')
}
