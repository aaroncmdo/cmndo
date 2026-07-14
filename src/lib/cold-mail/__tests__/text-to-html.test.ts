import { describe, it, expect } from 'vitest'
import { textToHtml } from '../text-to-html'

describe('textToHtml', () => {
  it('erhaelt Zeilenumbrueche als <br> (sonst kollabiert der Text zu einer Zeile)', () => {
    expect(textToHtml('Guten Tag,\nkurze Frage.')).toBe('Guten Tag,<br>kurze Frage.')
  })

  it('macht aus einer Leerzeile einen Absatz-Abstand', () => {
    expect(textToHtml('Hallo\n\nText')).toBe('Hallo<br><br>Text')
  })

  it('escaped HTML-Sonderzeichen aus dem Klartext', () => {
    expect(textToHtml('Preis < 100 & fair')).toBe('Preis &lt; 100 &amp; fair')
  })

  it('laesst Merge-Platzhalter unangetastet (werden erst danach serverseitig ersetzt)', () => {
    expect(textToHtml('Hallo {{Ansprechpartner}}')).toBe('Hallo {{Ansprechpartner}}')
  })
})
