// Reine, testbare Logik fuer die Oeffnungsrichtung des UpdatesNav-Popovers.
// Aus UpdatesNav.tsx extrahiert (bewusst OHNE React-Import), damit vitest
// (node-env, kein jsdom in diesem Repo) das Class-Mapping der tatsaechlich
// ausgelieferten Logik direkt smoke-testen kann — siehe popover-placement.test.ts.

// Öffnungsrichtung des Popovers relativ zum Button:
//  'down-left' (Default) = unter dem Button, rechtsbündig — für Buttons die
//      oben-rechts sitzen (Header / fixed Top-Corner-Mounts in Admin/Dispatch/
//      Kanzlei/Mitarbeiter/Fälle/Kunde-Mobile). Verhalten bleibt unverändert.
//  'up-right' = über dem Button, linksbündig (spiegelt nach oben + rechts) —
//      für Buttons die unten-links sitzen (Makler-Sidebar-Footer, Kunde-
//      Sidebar-Fuß). Sonst liefe das Popover unter den unteren Viewport-Rand.
export type PopoverPlacement = 'down-left' | 'up-right'

export type ResolvedPopoverPlacement = {
  /** Tailwind-Positions-Utilities fuer das absolut positionierte Popover. */
  posClass: string
  /** framer-motion Einflug-Offset auf der Y-Achse (je Richtung gespiegelt). */
  enterY: number
}

// 'up-right' spiegelt das Default-Popover nach oben (bottom-full statt mt-2) UND
// nach rechts (left-0 statt right-0); die Einflug-Animation wird mitgespiegelt
// (von unten statt von oben). 'down-left' = exakt das bisherige Verhalten.
export function resolvePopoverPlacement(placement: PopoverPlacement): ResolvedPopoverPlacement {
  const up = placement === 'up-right'
  return {
    posClass: up ? 'left-0 bottom-full mb-2' : 'right-0 mt-2',
    enterY: up ? 4 : -4,
  }
}
