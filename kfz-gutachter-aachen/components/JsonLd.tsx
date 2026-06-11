// <JsonLd/> · rendert ein JSON-LD-Objekt als <script type="application/ld+json">.
// Escaped `<` → < (XSS-Schutz, falls dynamische Strings — z.B. Stadtnamen —
// in den Graph wandern). Pattern aus autounfall-io.
export function JsonLd({ data }: { data: object }) {
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}
