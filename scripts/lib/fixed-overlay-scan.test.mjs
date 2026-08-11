import { describe, it, expect } from 'vitest'
import {
  scanShellContent,
  scanCornerOverlayContent,
  istEckenOverlayKlasse,
  diffBaseline,
} from './fixed-overlay-scan.mjs'

describe('scanShellContent (Regel 1: Shell-Vertrag)', () => {
  it('Shell mit FAB ohne Safe-Area -> Verletzung', () => {
    const src = `
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children}</main>
      <GlobalPosteingangFab currentUserId={id} />
    `
    expect(scanShellContent(src)).toMatch(/keine lg:pb-20\+ Safe-Area/)
  })

  it('Shell mit FAB und lg:pb-20 -> ok', () => {
    const src = `
      <main className="flex-1 overflow-y-auto pb-16 md:pb-0 lg:pb-20">{children}</main>
      <GlobalPosteingangFab currentUserId={id} />
    `
    expect(scanShellContent(src)).toBeNull()
  })

  it('groessere Reserve (lg:pb-24) zaehlt auch', () => {
    const src = `<main className="overflow-y-auto lg:pb-24" /><GlobalPosteingangFab />`
    expect(scanShellContent(src)).toBeNull()
  })

  it('zu kleine Reserve (lg:pb-4) reicht nicht', () => {
    const src = `<main className="overflow-y-auto lg:pb-4" /><GlobalPosteingangFab />`
    expect(scanShellContent(src)).not.toBeNull()
  })

  it('findet die Safe-Area auch im Template-Literal-className', () => {
    const src =
      '<main className={`h-full overflow-y-auto pb-[calc(1px)] lg:pb-20 ${x ? "a" : "b"}`}>{c}</main><GlobalPosteingangFab />'
    expect(scanShellContent(src)).toBeNull()
  })

  // Beim Selbsttest 11.08. aufgefallen: der Erklaer-Kommentar im <main>-Tag enthaelt
  // selbst "lg:pb-20". Ohne Kommentar-Stripping haette der Scan die Safe-Area auch
  // dann "gefunden", wenn die Klasse entfernt wurde -> Gate blind.
  it('ein Kommentar mit lg:pb-20 zaehlt NICHT als Safe-Area', () => {
    const src = `
      <main
        /* lg:pb-20 = Safe-Area fuer den GlobalPosteingangFab, siehe globals.css */
        className="flex-1 overflow-y-auto pb-16 md:pb-0"
      >{children}</main>
      <GlobalPosteingangFab />
    `
    expect(scanShellContent(src)).toMatch(/keine lg:pb-20\+ Safe-Area/)
  })

  it('auskommentierter FAB-Mount zaehlt nicht als Mount', () => {
    const src = `// <GlobalPosteingangFab />\n<main className="overflow-y-auto" />`
    expect(scanShellContent(src)).toBeNull()
  })

  it('File ohne FAB wird nie geflaggt', () => {
    expect(scanShellContent('<main className="overflow-y-auto">{children}</main>')).toBeNull()
  })

  it('FAB-Mount ohne eigenes <main> -> kein Treffer (Vertrag greift in der Shell)', () => {
    expect(scanShellContent('<GlobalPosteingangFab currentUserId={id} />')).toBeNull()
  })
})

describe('istEckenOverlayKlasse (Regel 2)', () => {
  it('erkennt fixed + bottom + right', () => {
    expect(istEckenOverlayKlasse('hidden lg:flex fixed right-4 bottom-4 z-[950]')).toBe(true)
  })
  it('responsive Praefixe zaehlen', () => {
    expect(istEckenOverlayKlasse('fixed lg:bottom-6 lg:right-6')).toBe(true)
  })
  it('vollflaechige Overlays (inset-0) sind keine Ecke', () => {
    expect(istEckenOverlayKlasse('fixed inset-0 bottom-0 right-0 bg-black/10')).toBe(false)
  })
  it('nur bottom (Leiste) ist keine Ecke', () => {
    expect(istEckenOverlayKlasse('fixed bottom-0 left-0 w-full')).toBe(false)
  })
  it('ohne fixed egal', () => {
    expect(istEckenOverlayKlasse('absolute bottom-4 right-4')).toBe(false)
  })
})

describe('scanCornerOverlayContent (Regel 2)', () => {
  it('findet die Klasse im String-Literal', () => {
    const src = `<div className="hidden lg:flex fixed right-4 bottom-4 z-[950]" />`
    expect(scanCornerOverlayContent(src)).toMatch(/untere(n)? rechte/)
  })
  it('harmloses File -> null', () => {
    expect(scanCornerOverlayContent('<div className="flex gap-2" />')).toBeNull()
  })
})

describe('diffBaseline', () => {
  it('trennt neu und behoben', () => {
    expect(diffBaseline(['a', 'c'], ['a', 'b'])).toEqual({ added: ['c'], removed: ['b'] })
  })
})
