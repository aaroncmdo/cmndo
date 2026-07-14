import type { CSSProperties } from 'react'
import { SIDEBAR_WIDTH_VAR, VEIL_BG, Z_SIDEBAR_VEIL } from './overlay-layers'

// Bewusst hookless + ohne 'use client': reine Praesentation, damit die Schicht
// per renderToStaticMarkup testbar bleibt (vitest laeuft auf environment
// 'node', kein jsdom).

const sidebarVeilStyle: CSSProperties = {
  position: 'fixed',
  top: 0,
  bottom: 0,
  left: 0,
  width: SIDEBAR_WIDTH_VAR,
  zIndex: Z_SIDEBAR_VEIL,
  backgroundColor: VEIL_BG,
  // Liegt UNTER der Sidebar (z 30 < 40), koennte also ohnehin keine Klicks von
  // ihr stehlen. pointer-events:none stellt zusaetzlich sicher, dass auch die
  // Luecken einer eingerueckten Sidebar (Kunde: left-2/top-2) nichts abfangen.
  pointerEvents: 'none',
}

/**
 * Die Haelfte des Overlay-Schleiers, die HINTER der Sidebar liegt.
 *
 * Sie dimmt nicht die Sidebar selbst — sie dimmt alles, was um sie herum bzw.
 * durch sie hindurch sichtbar bleibt:
 *
 *   - Die Sidebar ist ein EINGERUECKTES Panel (top-2/left-2/bottom-2). Ohne
 *     diesen Streifen bleibt der Seiten-Hintergrund rings um die Karte
 *     ungedimmt stehen — ein heller Rahmen, waehrend der Rest der App unter dem
 *     Dim liegt.
 *   - Laeuft die Sidebar transluzent (`data-sidebar-mode="floating"`), sampelt
 *     ihr backdrop-filter zusaetzlich denselben ungedimmten Hintergrund.
 *
 * Kein backdrop-blur: hinter der Sidebar liegt nur der flaechige Seiten-
 * Hintergrund (die Portale schieben ihren Content per `pl-56`/`ml-56`/`ml-64`
 * weg) — es gibt dort nichts zu verwischen, der Blur waere reine GPU-Kosten.
 *
 * Siehe overlay-layers.ts fuer die vollstaendige Schicht-Ordnung.
 */
export function SidebarVeil() {
  return <div aria-hidden="true" data-overlay-veil="sidebar" style={sidebarVeilStyle} />
}
