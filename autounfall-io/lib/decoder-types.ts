// Decoder-Content-Typen (WP-3). HTML-Felder = kontrollierter Content
// (dangerouslySetInnerHTML im Template), hrefs bereits umgeschrieben. Keine Imports.

/**
 * Stand der Decoder-Inhalte (ISO, YYYY-MM-DD) — speist `datePublished`/`dateModified`
 * im Article-Schema der Decoder-Seiten.
 *
 * WARUM: `decoderGraph()` erzeugt einen `Article`-Node ohne Datum, waehrend
 * `articleGraph()` und `restGraph()` in derselben Datei beide Felder laengst setzen.
 * Aktualitaet ist ein dokumentierter Zitations-Faktor fuer KI-Antwortmaschinen
 * (GEO-Baseline 18.08.2026, Befund B2). Ein `Article` ohne Erscheinungsdatum ist
 * ausserdem fuer Rich Results unvollstaendig.
 *
 * Der Decoder-Typ traegt kein eigenes Datum (die Inhalte liegen gebuendelt in
 * `content/`), deshalb hier eine gepflegte Konstante. Startwert = git-Datum von
 * `content/` (2026-07-19) — nachweisbar, nicht geschaetzt.
 *
 * ⚠ PFLEGE: Wer Decoder-Inhalte aendert, bumpt diesen Wert. Bewusst KEIN `new Date()`:
 * ein Datum, das ohne inhaltliche Aenderung mitwandert, entwertet das Signal.
 */
export const DECODER_LAST_UPDATED = '2026-07-19'

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
