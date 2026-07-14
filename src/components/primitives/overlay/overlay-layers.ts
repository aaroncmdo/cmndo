// SSoT fuer die z-Ordnung der Overlay-Schichten (Modal/Drawer) relativ zur
// Sidebar. Die Reihenfolge ist hier die eigentliche Fach-Regel, nicht bloss
// eine Zahl — deshalb liegt sie in EINEM Modul und wird per Test festgenagelt
// (overlay-layers.test.ts).
//
// Warum das ueberhaupt heikel ist:
// Die Sidebars sind EINGERUECKTE Panels — PortalNav `top-2 left-2 bottom-2 w-52`,
// Kunde `top-2 left-2 bottom-2 lg:w-60`. Rings um die Karte liegt also der blanke
// Seiten-Hintergrund (`bg-claimondo-bg`, hell). Ein Schleier, der per left-Offset
// erst BEI --app-sidebar-width beginnt, laesst diesen Rahmen ungedimmt stehen:
// ein heller Streifen links, rechts, oben und unten um die Sidebar, waehrend der
// Rest der App unter dem Dim liegt. Der Dim bricht sichtbar an der Kante ab.
// (Laeuft eine Sidebar zusaetzlich transluzent — `data-sidebar-mode="floating"`,
// 55 % Deckung + backdrop-filter in globals.css —, sampelt ihr Glas denselben
// ungedimmten Hintergrund. Derselbe Streifen loest beides.)
//
// Loesung — der Schleier wird gespalten statt weggeschoben:
//
//   z 30    Sidebar-Streifen   fixed, [0 .. --app-sidebar-width]
//                              dimmt den Hintergrund HINTER dem Glas
//   z 40    Sidebar            bleibt scharf, bedienbar, ungedimmt
//   z 1000  Content-Schleier   fixed, [--app-sidebar-width .. rechts]
//                              dimmt den Content + faengt Klicks ab
//   z 1000  Dialog             darueber (spaeter im DOM)
//
// Ergebnis: durchgaengiger Dim ueber den ganzen Viewport, und die Sidebar
// bleibt trotzdem ausgespart und bedienbar.

/** Schleier-Streifen unter der Sidebar. MUSS < Z_SIDEBAR bleiben. */
export const Z_SIDEBAR_VEIL = 30

/**
 * Basis-Ebene der Portal-Sidebars. Wird von den Sidebars TATSAECHLICH konsumiert
 * (`style={{ zIndex: Z_SIDEBAR }}`), nicht nur dokumentiert — sonst koennte der
 * Test die Invariante nicht durchsetzen:
 *
 *   - PortalNav, beide Varianten  (Admin/Dispatch/Kanzlei/Mitarbeiter/Makler/
 *     Werkstatt/Flotte). Die `light`-Variante braucht dafuer zwingend
 *     `position: relative` — ein nicht-positioniertes Element wuerde vom
 *     positionierten Schleier UEBERDECKT.
 *   - Kunde-Sidebar (src/app/kunde/layout.tsx)
 *
 * Einzige Ausnahme: die SV-Sidebar (GutachterShell) traegt eigene, HOEHERE Werte
 * (`z-50` mobil, `lg:z-[1100]`), weil sie ueber der Mapbox-Karte im Feldmodus
 * liegen muss. Unkritisch — worauf es ankommt, ist "Schleier UNTER jeder
 * Sidebar", und 30 < 40 < 1100.
 */
export const Z_SIDEBAR = 40

/** Content-Schleier + Dialog. Liegt ueber dem Content, spart die Sidebar aus. */
export const Z_OVERLAY = 1000

/**
 * Custom-Property, die die Trennlinie zwischen beiden Schleier-Haelften traegt.
 * Gesetzt von <SidebarWidthVar> (components/shared/SidebarWidthVar.tsx), das
 * jede Shell mit fixer Sidebar genau einmal rendert:
 *
 *   PortalNav       224px ab md   (Admin/Dispatch/Kanzlei/Mitarbeiter/Makler)
 *   GutachterShell  272px ab lg   (256px Sidebar + 16px pl-4)
 *   Kunde-Layout    256px ab lg   (passend zum lg:ml-64 des <main>)
 *
 * Auf Mobile ueberall 0px -> Streifen verschwindet, das Overlay wird
 * vollflaechig (dort gibt es keine Sidebar, die ausgespart werden muesste).
 */
export const SIDEBAR_WIDTH_PROP = '--app-sidebar-width'

/** Dieselbe Property als CSS-Wert, mit 0px-Fallback fuer Shells ohne Sidebar. */
export const SIDEBAR_WIDTH_VAR = `var(${SIDEBAR_WIDTH_PROP}, 0px)`

/** Dim-Ton. Muss in BEIDEN Schleier-Haelften identisch sein, sonst entsteht
 *  genau die sichtbare Kante, die wir beseitigen. */
export const VEIL_BG = 'color-mix(in srgb, var(--brand-primary, #0D1B3E) 22%, transparent)'
