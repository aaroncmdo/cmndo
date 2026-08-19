import { describe, it, expect } from 'vitest'
import {
  scanContent,
  extractBlocks,
  stripSpreadConditionals,
  diffBaseline,
} from '../metadata-merge-scan.mjs'

describe('scanContent (metadata-merge)', () => {
  it('openGraph ohne images -> Verletzer (der reale #5369-Fall)', () => {
    const src = [
      'export const metadata = {',
      '  openGraph: {',
      "    type: 'article',",
      '    title: a.title,',
      '  },',
      '}',
    ].join('\n')
    const f = scanContent(src)
    expect(f).toHaveLength(1)
    expect(f[0].key).toBe('openGraph')
    expect(f[0].line).toBe(2)
  })

  it('openGraph MIT images -> sauber', () => {
    const src = ['export const metadata = {', '  openGraph: {', '    images: OG_DEFAULT_IMAGES,', '  },', '}'].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('images NUR im Spread-Conditional -> Verletzer (der autounfall-[article]-Fall)', () => {
    // Genau dieses Muster liess 31 Artikel ohne Vorschaubild; ein
    // "enthaelt images"-Grep haette es durchgewunken.
    const src = [
      'export function generateMetadata() {',
      '  return {',
      '    openGraph: {',
      "      type: 'article',",
      '      ...(article.hero',
      '        ? { images: [{ url: article.hero.src }] }',
      '        : {}),',
      '    },',
      '  }',
      '}',
    ].join('\n')
    const f = scanContent(src)
    expect(f).toHaveLength(1)
    expect(f[0].reason).toMatch(/Spread-Conditional/)
  })

  it('images per Ternary DIREKT zugewiesen -> sauber (immer gesetzt)', () => {
    const src = [
      'export function generateMetadata() {',
      '  return {',
      '    openGraph: {',
      '      images: article.hero ? [article.hero.src] : [OG_IMAGE],',
      '    },',
      '  }',
      '}',
    ].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('twitter ohne images -> Verletzer (der /werkstatt-finden-Fall)', () => {
    const src = [
      'export const metadata = {',
      '  twitter: {',
      "    card: 'summary_large_image',",
      '    title: t.title,',
      '  },',
      '}',
    ].join('\n')
    const f = scanContent(src)
    expect(f).toHaveLength(1)
    expect(f[0].key).toBe('twitter')
  })

  it('beide Bloecke ohne images -> zwei Findings', () => {
    const src = [
      'export const metadata = {',
      '  openGraph: { title: x },',
      '  twitter: { card: y },',
      '}',
    ].join('\n')
    expect(scanContent(src)).toHaveLength(2)
  })

  it('Root-Layout (metadataBase) -> NIE geflaggt, es DEFINIERT den Default', () => {
    const src = [
      'export const metadata = {',
      '  metadataBase: new URL(SITE_URL),',
      '  openGraph: {',
      '    title: x,',
      '  },',
      '}',
    ].join('\n')
    expect(scanContent(src)).toEqual([])
  })

  it('images in einem Kommentar zaehlt NICHT', () => {
    const src = [
      'export const metadata = {',
      '  openGraph: {',
      '    // images: OG_DEFAULT_IMAGES,  <- absichtlich auskommentiert',
      '    title: x,',
      '  },',
      '}',
    ].join('\n')
    expect(scanContent(src)).toHaveLength(1)
  })

  it('images in einem String zaehlt NICHT', () => {
    const src = ['export const metadata = {', '  openGraph: {', "    title: 'images: nein',", '  },', '}'].join('\n')
    expect(scanContent(src)).toHaveLength(1)
  })

  it('kein openGraph/twitter -> nichts zu pruefen', () => {
    expect(scanContent('export const metadata = { title: "x" }')).toEqual([])
  })

  it('verschachtelte Objekte im Block verwirren das Depth-Tracking nicht', () => {
    const src = [
      'export const metadata = {',
      '  openGraph: {',
      '    images: [{ url: a, width: 1200, height: 630 }],',
      '  },',
      '}',
    ].join('\n')
    expect(scanContent(src)).toEqual([])
  })
})

describe('extractBlocks', () => {
  it('findet mehrere Vorkommen desselben Keys', () => {
    const code = 'a = { openGraph: { x: 1 } }; b = { openGraph: { y: 2 } }'
    expect(extractBlocks(code, 'openGraph')).toHaveLength(2)
  })
})

describe('stripSpreadConditionals', () => {
  it('entfernt ...( … ) inklusive verschachtelter Klammern', () => {
    const out = stripSpreadConditionals('a: 1, ...(x ? { images: f(1, (2)) } : {}), b: 2')
    expect(out).not.toMatch(/images/)
    expect(out).toMatch(/a: 1/)
    expect(out).toMatch(/b: 2/)
  })
})

describe('diffBaseline', () => {
  it('meldet neue Verletzer und behobene', () => {
    expect(diffBaseline(['a', 'c'], ['a', 'b'])).toEqual({ neu: ['c'], behoben: ['b'] })
  })
})
