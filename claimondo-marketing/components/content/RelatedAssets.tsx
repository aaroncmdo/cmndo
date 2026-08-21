import Link from 'next/link'
import { getAllAssets, type ClaimondoAsset } from '@/lib/content/claimondo-mdx'
import { SnippetText } from './SnippetText'

const HEAD_FONT = { fontFamily: 'Montserrat, system-ui, sans-serif' } as const

const MAX_VERWANDTE = 6

/**
 * Cluster-Geschwister des aktuellen Assets (gleicher Cluster + Ordner) — ab dem
 * Geschwister, das alphabetisch NACH dem aktuellen kommt, zyklisch weiter.
 *
 * Vorher wurden immer die ERSTEN {@link MAX_VERWANDTE} genommen, und
 * `getAllAssets()` liefert sie in Verzeichnis-, also alphabetischer Reihenfolge.
 * Bei einem grossen Cluster zeigt damit JEDE Seite dieselben sechs
 * Anfangsbuchstaben; der Rest erscheint in dieser Box nirgends. Gemessen ueber
 * die 57 haftpflicht-Spokes (21.08.2026): **21 Seiten tauchten in keiner
 * einzigen Box auf** — darunter `reparaturkosten`, `sv-kosten`,
 * `nutzungsausfall`, `mietwagen`. Die zyklische Rotation verteilt gleichmaessig
 * (jede Seite 4–6 statt 0–19) und bleibt dabei deterministisch: gleiche Eingabe,
 * gleiche Ausgabe, also reproduzierbare Builds.
 *
 * ⚠ Die kuratierte `related`-Liste wird hier BEWUSST NICHT bevorzugt, obwohl sie
 * in allen 57 Spokes gepflegt ist. Der Versuch wurde gebaut und gemessen — er
 * verschlechtert die Verlinkung: auf /haftpflicht/wertminderung fielen die
 * internen Links von 9 auf 5, weil drei der vier kuratierten Ziele ohnehin schon
 * als Inline-Links im Fliesstext stehen (Redundanz statt Breite) und ein
 * /decoder/-Ziel einen Slot belegt, ohne ein Cluster-Geschwister zu sein.
 * Die thematische Naehe deckt der Fliesstext bereits ab; diese Box ist fuer die
 * BREITE da.
 *
 * ⚠ Die Ueberschrift nennt keinen Cluster mehr — die Cluster-Zugehoerigkeit
 * steht ohnehin an jedem Eintrag (`nummer`), und ohne sie bleibt die Box auch
 * dann korrekt, wenn spaeter cluster-fremde Eintraege dazukommen.
 */
export function RelatedAssets({ current }: { current: ClaimondoAsset }) {
  if (!current.cluster) return null
  const geschwister = getAllAssets().filter(
    (a) => a.cluster === current.cluster && a.folder === current.folder && a.url !== current.url,
  )
  if (geschwister.length === 0) return null

  const start = Math.max(
    geschwister.findIndex((a) => a.url > current.url),
    0,
  )
  const siblings = Array.from(
    { length: Math.min(MAX_VERWANDTE, geschwister.length) },
    (_, i) => geschwister[(start + i) % geschwister.length],
  )
  if (siblings.length === 0) return null

  return (
    <aside className="mt-14 border-t border-claimondo-border pt-8">
      <h2 style={HEAD_FONT} className="mb-5 text-xl font-bold text-claimondo-navy">
        Verwandte Themen
      </h2>
      <ul className="grid gap-3.5 sm:grid-cols-2">
        {siblings.map((s) => (
          <li key={s.url}>
            <Link
              href={s.url}
              className="block h-full rounded-ios-md border border-claimondo-border bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-claimondo-ondo hover:shadow-claimondo-sm"
            >
              {s.nummer && (
                <span className="text-[0.6875rem] font-bold uppercase tracking-[0.1em] text-claimondo-light-blue">
                  {s.nummer}
                </span>
              )}
              <span style={HEAD_FONT} className="mt-1 block font-bold leading-snug text-claimondo-navy">
                {s.title}
              </span>
              {s.snippet && <span className="mt-1 block line-clamp-2 text-[0.8125rem] text-claimondo-shield/70"><SnippetText>{s.snippet}</SnippetText></span>}
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
