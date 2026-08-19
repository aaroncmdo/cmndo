import { describe, expect, it } from 'vitest'
import { attribut, istClientseitig, sichtbarerText, textIn } from '../html'

describe('sichtbarerText', () => {
  it('entfernt Skripte und Formatvorlagen mitsamt Inhalt', () => {
    const h = '<html><head><style>body{color:red}</style></head><body>Hallo<script>var x=1</script></body></html>'
    expect(sichtbarerText(h)).toBe('Hallo')
  })

  it('deutet Entities', () => {
    expect(sichtbarerText('<p>Gr&ouml;&szlig;e &amp; Ma&szlig;</p>')).toBe('Größe & Maß')
  })

  it('deutet numerische Entities', () => {
    expect(sichtbarerText('<p>&#8211; &#x2014;</p>')).toBe('– —')
  })
})

describe('textIn', () => {
  it('liest den Inhalt aller Vorkommen eines Elements', () => {
    expect(textIn('<h1>Erste</h1><p>x</p><h1 class="a">Zweite</h1>', 'h1'))
      .toEqual(['Erste', 'Zweite'])
  })

  it('liefert eine leere Liste, wenn das Element fehlt', () => {
    expect(textIn('<p>nur Text</p>', 'h1')).toEqual([])
  })

  it('faellt nicht auf ein aehnlich benanntes Element herein', () => {
    // <header> darf nicht als <head> zaehlen — daher die Wortgrenze.
    expect(textIn('<header>Kopf</header>', 'head')).toEqual([])
  })
})

describe('attribut', () => {
  it('liest ein Attribut aus allen Vorkommen', () => {
    const h = '<meta name="description" content="Erste"><meta name="viewport" content="width">'
    expect(attribut(h, 'meta', 'content')).toEqual(['Erste', 'width'])
  })

  it('ueberspringt Vorkommen ohne das Attribut', () => {
    const h = '<meta charset="utf-8"><meta name="description" content="Da">'
    expect(attribut(h, 'meta', 'content')).toEqual(['Da'])
  })
})

describe('istClientseitig', () => {
  it('erkennt eine Anwendung an wenig Text in viel Auszeichnung', () => {
    const spa = '<html><body><div id="root"></div>' +
      '<script src="/bundle.js"></script>'.repeat(200) + '</body></html>'
    expect(istClientseitig(spa)).toBe(true)
  })

  it('haelt eine gewoehnliche Seite nicht fuer clientseitig', () => {
    const seite = '<html><body>' + 'Sachverständigenbüro Meyer in Münster. '.repeat(80) + '</body></html>'
    expect(istClientseitig(seite)).toBe(false)
  })

  it('haelt eine kurze, aber echt ausgelieferte Seite nicht fuer clientseitig', () => {
    // Wenig Text, aber hoher Anteil — beide Schwellen muessen zutreffen.
    expect(istClientseitig('<html><body><p>Kurz, aber echt.</p></body></html>')).toBe(false)
  })

  it('haelt leeres HTML nicht fuer clientseitig', () => {
    // Nichts zu messen ist keine Anwendung — Verhalten aus web.ts uebernommen.
    expect(istClientseitig('')).toBe(false)
  })
})
