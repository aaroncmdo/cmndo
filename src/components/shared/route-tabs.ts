import type { LucideIcon } from 'lucide-react'

export type RouteTab = {
  href: string
  label: string
  icon?: LucideIcon
  badge?: number
  /** Index-Route: exact match statt startsWith (sonst matcht sie alle Sub-Routen). */
  exact?: boolean
}

/** Aktiv-State fuer eine route-basierte Tab-Leiste. Pure — ohne next/navigation testbar. */
export function isRouteTabActive(
  pathname: string | null,
  href: string,
  exact?: boolean,
): boolean {
  if (!pathname) return false
  if (exact) return pathname === href
  return pathname === href || pathname.startsWith(href + '/')
}
