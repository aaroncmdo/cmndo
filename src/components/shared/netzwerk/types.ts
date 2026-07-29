// src/components/shared/netzwerk/types.ts
export type NetzwerkPortal = 'gutachter' | 'makler' | 'werkstatt' | 'flotte'
export const NETZWERK_HREF: Record<NetzwerkPortal, string> = {
  gutachter: '/gutachter/netzwerk',
  makler: '/makler/netzwerk',
  werkstatt: '/werkstatt/netzwerk',
  flotte: '/flotte/netzwerk',
}
