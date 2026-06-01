import { Fragment, type ReactNode } from 'react'

// [text](url) -> text: Link-Markup entfernen. Snippets liegen in Vorschau-Karten
// innerhalb eines <Link> -> ein echtes <a> waere ein verschachtelter Anchor
// (invalides HTML), und in einem Teaser wollen wir ohnehin keinen zweiten Link.
const MD_LINK = /\[([^\]]+)\]\([^)]*\)/g
// (**fett**) als Split-Token — die Capture-Group behaelt den Delimiter im Ergebnis.
const MD_BOLD = /(\*\*[^*]+\*\*)/g

/**
 * Rendert einen Content-Snippet (die „Kurz erklaert"-Passage aus dem Markdown)
 * als INLINE-Text mit echtem Fett. Behebt literal sichtbare Marker (`**fett**`,
 * `[text](url)`) an den Plain-Text-Snippet-Stellen: AssetHero-Intro, die Hub-
 * Listen (decoder/haftpflicht/sachverstaendige) und die RelatedAssets-Karten.
 *
 * Bewusst minimal + inline (kein Block-Markup wie MarkdownRenderer): nur
 * **fett** -> <strong>, Links -> reiner Linktext. Die Kurz-erklaert-Bloecke
 * enthalten ausschliesslich diese beiden Inline-Konstrukte (projektweit geprueft).
 */
export function SnippetText({ children }: { children: string }): ReactNode {
  const text = children.replace(MD_LINK, '$1')
  return text.split(MD_BOLD).map((part, i) => {
    const bold = /^\*\*([^*]+)\*\*$/.exec(part)
    return bold ? (
      <strong key={i} className="font-semibold text-claimondo-navy">
        {bold[1]}
      </strong>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  })
}
