// src/components/shared/netzwerk/types.ts
export type NetzwerkPortal = 'gutachter' | 'makler' | 'werkstatt'
export const NETZWERK_HREF: Record<NetzwerkPortal, string> = {
  gutachter: '/gutachter/netzwerk',
  makler: '/makler/netzwerk',
  werkstatt: '/werkstatt/netzwerk',
}
