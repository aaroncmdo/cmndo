import { describe, it, expect } from 'vitest'
import { remarkHeadingAnker } from './remark-heading-anker'

// Der Plugin-Vertrag: `## Titel {#anker}` wird zu einer Ueberschrift mit id="anker",
// und `{#anker}` verschwindet aus dem sichtbaren Text. Alles andere bleibt unangetastet.

type Knoten = { type: string; value?: string; children?: Knoten[]; data?: { hProperties?: Record<string, unknown> } }

const text = (value: string): Knoten => ({ type: 'text', value })
const heading = (...kinder: Knoten[]): Knoten => ({ type: 'heading', children: kinder })
const wurzel = (...kinder: Knoten[]): Knoten => ({ type: 'root', children: kinder })

function lauf(baum: Knoten): Knoten {
  // @ts-expect-error — unified-Plugin-Signatur, hier direkt aufgerufen
  remarkHeadingAnker()(baum)
  return baum
}

describe('remarkHeadingAnker', () => {
  it('zieht den Anker aus dem Text in die id', () => {
    const h = heading(text('1. Die ersten 72 Stunden {#akut}'))
    lauf(wurzel(h))
    expect(h.data?.hProperties?.id).toBe('akut')
    expect(h.children![0].value).toBe('1. Die ersten 72 Stunden')
  })

  it('laesst eine Ueberschrift ohne Anker unveraendert', () => {
    const h = heading(text('Was kostet ein Gutachten?'))
    lauf(wurzel(h))
    expect(h.data?.hProperties).toBeUndefined()
    expect(h.children![0].value).toBe('Was kostet ein Gutachten?')
  })

  it('findet den Anker auch, wenn die Ueberschrift formatierte Teile enthaelt', () => {
    // `## **Fett** und Rest {#x}` — der Anker haengt am LETZTEN Textknoten, nicht am ersten.
    const letzter = text(' und Rest {#fristen}')
    const h = heading({ type: 'strong', children: [text('Fett')] }, letzter)
    lauf(wurzel(h))
    expect(h.data?.hProperties?.id).toBe('fristen')
    expect(letzter.value).toBe(' und Rest')
  })

  it('ruehrt einen Absatz nicht an, auch wenn dort {#…} steht', () => {
    // Nur Ueberschriften tragen Sprungmarken. Ein Absatz, der die Syntax zufaellig
    // enthaelt, soll sie sichtbar behalten.
    const p: Knoten = { type: 'paragraph', children: [text('Siehe {#akut} weiter unten')] }
    lauf(wurzel(p))
    expect(p.children![0].value).toBe('Siehe {#akut} weiter unten')
    expect(p.data?.hProperties).toBeUndefined()
  })

  it('greift auch bei verschachtelten Ueberschriften tiefer im Baum', () => {
    const h = heading(text('Tief {#tief}'))
    lauf(wurzel({ type: 'blockquote', children: [h] }))
    expect(h.data?.hProperties?.id).toBe('tief')
  })

  it('akzeptiert Bindestriche und Ziffern im Anker, aber keine Sonderzeichen', () => {
    const gut = heading(text('A {#teil-2}'))
    lauf(wurzel(gut))
    expect(gut.data?.hProperties?.id).toBe('teil-2')

    const schlecht = heading(text('B {#nicht gut}'))
    lauf(wurzel(schlecht))
    expect(schlecht.data?.hProperties).toBeUndefined()
    expect(schlecht.children![0].value).toBe('B {#nicht gut}')
  })

  it('nimmt nur den Anker am ENDE, nicht mittendrin', () => {
    const h = heading(text('{#vorne} steht im Text'))
    lauf(wurzel(h))
    expect(h.data?.hProperties).toBeUndefined()
  })

  it('behaelt eine bereits gesetzte hProperties-Angabe bei', () => {
    const h: Knoten = { type: 'heading', children: [text('X {#y}')], data: { hProperties: { className: 'a' } } }
    lauf(wurzel(h))
    expect(h.data?.hProperties).toEqual({ className: 'a', id: 'y' })
  })
})
