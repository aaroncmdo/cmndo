// <JsonLd/> · rendert ein JSON-LD-Graph-Objekt als <script type="application/ld+json">.
// Escaped `<` → < (XSS-Schutz, falls dynamische Strings in den Graph wandern).
// STANDALONE: der uebergebene Graph enthaelt nur Kitta-&-Sprafke-UG-/LexDrive-Knoten.
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
