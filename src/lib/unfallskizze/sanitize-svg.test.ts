import { describe, it, expect } from 'vitest'
import { sanitizeSvg } from './sanitize-svg'

describe('sanitizeSvg — XSS-Haertung der AI-Unfallskizze', () => {
  it('entfernt <script>-Elemente inkl. Inhalt', () => {
    const out = sanitizeSvg('<svg><script>alert(1)</script><rect/></svg>')
    expect(out).not.toMatch(/script/i)
    expect(out).toContain('<rect')
  })

  it('entfernt <foreignObject> (HTML/JS-Einschleusung)', () => {
    const out = sanitizeSvg('<svg><foreignObject><body onload="alert(1)"></body></foreignObject></svg>')
    expect(out).not.toMatch(/foreignObject/i)
    expect(out).not.toMatch(/onload/i)
  })

  it('entfernt on*-Event-Handler (onload/onclick, mit " \' und ohne Quotes)', () => {
    expect(sanitizeSvg('<svg onload="alert(1)"><rect/></svg>')).not.toMatch(/onload/i)
    expect(sanitizeSvg("<svg><circle onclick='steal()'/></svg>")).not.toMatch(/onclick/i)
    expect(sanitizeSvg('<svg><a onmouseover=alert(1)>x</a></svg>')).not.toMatch(/onmouseover/i)
  })

  it('entfernt javascript:/data: in href / xlink:href', () => {
    expect(sanitizeSvg('<svg><a href="javascript:alert(1)">x</a></svg>')).not.toMatch(/javascript:/i)
    expect(sanitizeSvg('<svg><use xlink:href="data:text/html,<script>1</script>"/></svg>')).not.toMatch(/data:text/i)
  })

  it('entfernt <style> (expression()/@import-Vektoren)', () => {
    expect(sanitizeSvg('<svg><style>* { background: url(javascript:1) }</style><rect/></svg>')).not.toMatch(/<style/i)
  })

  it('laesst eine legitime Unfallskizze (Formen/Text) unveraendert', () => {
    const legit = '<svg viewBox="0 0 100 100"><rect x="10" y="10" width="30" height="15" fill="#333"/><line x1="0" y1="50" x2="100" y2="50" stroke="#000"/><text x="5" y="20">Auto A</text></svg>'
    expect(sanitizeSvg(legit)).toBe(legit)
  })
})
