import { describe, it, expect } from 'vitest'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import {
  SIDEBAR_WIDTH_VAR,
  VEIL_BG,
  Z_OVERLAY,
  Z_SIDEBAR,
  Z_SIDEBAR_VEIL,
} from './overlay-layers'
import { SidebarVeil } from './OverlayVeil.web'

// Regression-Guard fuer den Sidebar-Schleier-Bug (2026-07-14).
//
// Symptom: Bei offenem Modal war der gedimmte Hintergrund nicht durchgaengig —
// rings um die Sidebar blieb der UNGEDIMMTE Seiten-Hintergrund sichtbar.
//
// Ursache: Der Schleier wurde per `left: var(--app-sidebar-width)` NEBEN die
// Sidebar geschoben, damit sie bedienbar bleibt. Die Sidebar ist aber ein
// EINGERUECKTES Panel (top-2/left-2/bottom-2) — rings um die Karte lag also
// blanker, ungedimmter Seiten-Hintergrund, waehrend rechts davon alles unter
// dem Dim lag. Der Dim brach sichtbar an der Kante ab.
//
// Loesung: Der Schleier wird nicht weggeschoben, sondern GESPALTEN — ein
// Streifen UNTER der Sidebar (dimmt alles um sie herum) + der Content-Schleier
// UEBER dem Content (dimmt + faengt Klicks ab).
describe('Overlay-Layer — Schleier vs. Sidebar', () => {
  it('legt den Sidebar-Streifen UNTER die Sidebar', () => {
    // Das ist der Kern. Liegt der Streifen darueber, ueberdeckt er die Sidebar
    // (statt von ihrem Glas gesampelt zu werden) und sie ist weder scharf noch
    // bedienbar.
    expect(Z_SIDEBAR_VEIL).toBeLessThan(Z_SIDEBAR)
  })

  it('legt den Dialog UEBER die Sidebar-Ebene', () => {
    expect(Z_OVERLAY).toBeGreaterThan(Z_SIDEBAR)
  })

  it('deckt mit dem Streifen exakt die Sidebar-Breite — luecken- und ueberlappungsfrei zum Content-Schleier', () => {
    // Content-Schleier startet bei left = SIDEBAR_WIDTH_VAR. Der Streifen muss
    // also bei 0 beginnen und genau dort enden, sonst bleibt ein ungedimmter
    // Spalt (oder es entsteht ein doppelt gedimmter Streifen).
    const html = renderToStaticMarkup(React.createElement(SidebarVeil))
    expect(html).toContain('position:fixed')
    expect(html).toContain('left:0')
    expect(html).toContain(`width:${SIDEBAR_WIDTH_VAR}`)
  })

  it('nutzt denselben Dim-Ton wie der Content-Schleier', () => {
    // Zwei Toene = sichtbare Kante an der Sidebar-Grenze. Genau der Effekt,
    // den wir beseitigen.
    const html = renderToStaticMarkup(React.createElement(SidebarVeil))
    expect(html).toContain(VEIL_BG)
  })

  it('faengt keine Klicks ab — die Sidebar darueber bleibt bedienbar', () => {
    const html = renderToStaticMarkup(React.createElement(SidebarVeil))
    expect(html).toContain('pointer-events:none')
  })
})
