import type { Plugin } from 'unified'

// Liest `## Titel {#anker}` und macht daraus eine Ueberschrift mit `id="anker"`.
//
// WARUM ES DAS GIBT: Die Cornerstone-Texte trugen ihre Sprungmarken als rohes HTML in
// der Ueberschrift (`## <a name="akut"></a>1. Die ersten 72 Stunden`). react-markdown
// laesst rohes HTML nicht durch (kein rehype-raw, bewusst), also landete der Tag als
// sichtbarer TEXT auf der Seite — auf /ratgeber stand woertlich
// `<a name="frisch"></a>1. Wenn dir gerade jemand reingefahren ist`.
//
// Einfach loeschen ging nicht: 20 interne Links im selben Text springen auf diese Anker
// (`](#akut)`), und `rehype-slug` erzeugt aus dem Ueberschriftentext ganz andere IDs
// (`1-die-ersten-72-stunden-sofort-massnahmen`). Ohne stabile Anker waeren alle 20
// Sprungmarken still ins Leere gelaufen — ein Fix, der einen Nachbarn bricht.
//
// Dieses Plugin laeuft VOR rehype-slug und setzt die ID selbst. rehype-slug ueberschreibt
// vorhandene IDs nicht, die Wunsch-ID bleibt also stehen.
//
// Bewusst ohne `unist-util-visit`: der Baum wird hier in acht Zeilen durchlaufen, das
// spart eine Abhaengigkeit fuer genau einen Anwendungsfall.

type Knoten = {
  type: string
  value?: string
  children?: Knoten[]
  data?: { hProperties?: Record<string, unknown> }
}

/** `{#anker}` am Ende, mit optionalem Leerraum davor. */
const ANKER = /\s*\{#([A-Za-z0-9][A-Za-z0-9_-]*)\}\s*$/

function letzterTextKnoten(knoten: Knoten): Knoten | null {
  if (knoten.type === 'text') return knoten
  const kinder = knoten.children
  if (!kinder?.length) return null
  for (let i = kinder.length - 1; i >= 0; i--) {
    const treffer = letzterTextKnoten(kinder[i])
    if (treffer) return treffer
  }
  return null
}

export const remarkHeadingAnker: Plugin = () => (baum: unknown) => {
  const wurzel = baum as Knoten
  const gehe = (knoten: Knoten) => {
    if (knoten.type === 'heading') {
      const text = letzterTextKnoten(knoten)
      const treffer = text?.value?.match(ANKER)
      if (text && treffer) {
        text.value = text.value!.replace(ANKER, '')
        knoten.data = knoten.data ?? {}
        knoten.data.hProperties = { ...knoten.data.hProperties, id: treffer[1] }
      }
      return // Ueberschriften haben keine verschachtelten Ueberschriften
    }
    knoten.children?.forEach(gehe)
  }
  gehe(wurzel)
}
