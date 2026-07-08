// Reiner Klassen-Resolver fuer PortalShell. Getrennt von der Komponente, damit
// die Breakpoint-Logik ohne DOM/Hooks unit-testbar ist (Repo: vitest env=node,
// kein RTL). Tailwind-JIT kann keine dynamischen `${bp}:`-Klassen bauen → beide
// Breakpoints ausgeschrieben (literale Sets).

export type PortalShellBreakpoint = 'md' | 'lg'

const CANVAS: Record<PortalShellBreakpoint, string> = {
  md: 'md:bg-[var(--brand-primary)]',
  lg: 'lg:bg-[var(--brand-primary)]',
}
const CARD: Record<PortalShellBreakpoint, string> = {
  md: 'md:rounded-l-ios-xl md:rounded-r-none md:bg-claimondo-bg md:shadow-sm',
  lg: 'lg:rounded-l-ios-xl lg:rounded-r-none lg:bg-claimondo-bg lg:shadow-sm',
}
const CARD_GUTTER: Record<PortalShellBreakpoint, string> = {
  md: 'md:pl-4 md:pt-4 md:pb-4',
  lg: 'lg:pl-4 lg:pt-4 lg:pb-4',
}
const MOBILE_HIDE: Record<PortalShellBreakpoint, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
}

export function portalShellClasses(breakpoint: PortalShellBreakpoint) {
  return {
    canvas: CANVAS[breakpoint],
    card: CARD[breakpoint],
    cardGutter: CARD_GUTTER[breakpoint],
    mobileHide: MOBILE_HIDE[breakpoint],
  }
}
