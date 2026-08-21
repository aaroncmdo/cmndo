// Pillar-Slug -> Route. EINE Regel, drei Consumer.
//
// Einige Quell-Artikel tragen den rohen Prototyp-Slug ("pillar-06-spezialfaelle")
// statt der echten Route ("spezialfaelle"). lib/relations.ts kannte diese
// Normalisierung seit jeher — die beiden ANDEREN Stellen, die aus pillar.slug eine
// URL bauen, nicht:
//
//   * components/article/parts.tsx  — der sichtbare Brotkrumen-Link
//   * lib/jsonld.ts                 — der BreadcrumbList, den Google liest
//
// Ergebnis (Broken-Link-Crawl 21.08.2026): /pillar-06-spezialfaelle lief auf zwei
// Artikeln in einen 404 — im Brotkrumen UND im strukturierten Datensatz.
//
// ⚠ Die Normalisierung ist eine Drift-Bremse, KEIN Ersatz fuer korrekte Daten.
// Genau dieser Fall zeigt warum: einer der beiden Artikel (rueckwaertsfahren) trug
// "name": "Pillar 02" mit dem Slug von Pillar 06. Wer nur normalisiert, heilt den
// 404 und zementiert die falsche Zuordnung — ein Schuldfrage-Artikel haette
// dauerhaft unter "Spezialfaelle" gehangen. Die Daten sind mitkorrigiert.
export function pillarRoute(slug: string): string {
  return '/' + slug.replace(/^pillar-\d+-/, '')
}
