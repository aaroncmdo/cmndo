// Decoder-Content-Typen (WP-3). HTML-Felder = kontrollierter Content
// (dangerouslySetInnerHTML im Template), hrefs bereits umgeschrieben. Keine Imports.

export interface DecoderSection {
  h2: string
  html: string
}
export interface DecoderTable {
  cols: string[]
  rows: string[][]
}
export interface DecoderMuster {
  h2: string
  intro: string
  body: string // HTML mit <br>/<strong>
}
export interface DecoderFaq {
  q: string
  a: string
}
export type DecoderCtaKind = 'lex' | 'gutachter' | 'checker' | 'musterbrief'
export interface DecoderCta {
  h: string
  p: string
  ctas: DecoderCtaKind[]
}
export interface DecoderNextLink {
  href: string
  label: string
}
export interface DecoderNext {
  text: string
  links: DecoderNextLink[]
}

export interface Decoder {
  slug: string
  cluster: string
  crumbLast: string
  title: string
  headline: string
  metaDesc: string
  h1: string
  lede: string
  tldr: string // HTML (TL;DR / Quick-Answer)
  brief: string // HTML (Versicherer-Zitat)
  sections: DecoderSection[]
  table?: DecoderTable
  muster?: DecoderMuster
  next?: DecoderNext
  cta?: DecoderCta
  faq: DecoderFaq[]
  about: string[]
  sources: string
}
