import { describe, expect, it } from 'vitest'
import { resolvePopoverPlacement } from './popover-placement'

// Smoke fuer die tatsaechlich ausgelieferte Popover-Oeffnungslogik von UpdatesNav
// (UpdatesNav.tsx ruft genau diese Funktion auf und interpoliert posClass in das
// className des Popovers + enterY in die framer-motion initial/exit-Y).
describe('resolvePopoverPlacement', () => {
  it('down-left (Default, Button oben-rechts): oeffnet unter dem Button, rechtsbuendig', () => {
    const r = resolvePopoverPlacement('down-left')
    expect(r.posClass).toBe('right-0 mt-2')
    expect(r.posClass).not.toContain('bottom-full') // oeffnet NICHT nach oben
    expect(r.enterY).toBe(-4) // Einflug von oben
  })

  it('up-right (Button unten-links): oeffnet ueber dem Button + nach rechts (oben-rechts)', () => {
    const r = resolvePopoverPlacement('up-right')
    expect(r.posClass).toBe('left-0 bottom-full mb-2')
    expect(r.posClass).toContain('bottom-full') // Anchor ueber dem Button
    expect(r.posClass).toContain('left-0') // extends nach rechts
    expect(r.enterY).toBe(4) // Einflug von unten (gespiegelt)
  })

  it('beide Richtungen sind echte Spiegelungen (disjunkt, enterY invertiert)', () => {
    const down = resolvePopoverPlacement('down-left')
    const up = resolvePopoverPlacement('up-right')
    expect(down.posClass).not.toBe(up.posClass)
    expect(down.enterY).toBe(-up.enterY)
  })
})
