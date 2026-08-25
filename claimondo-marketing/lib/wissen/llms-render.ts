// Reine Render-Helfer fuer die LLM-Surfaces (llms.txt Index + llms-full.txt Voll-Dump).
// Kein IO — direkt unit-testbar. Format spiegelt assetBlock() der MDX-Assets in
// app/llms-full.txt/route.ts, damit AI-Crawler ein einheitliches Layout sehen.

import type { WissenArtikel } from './db-articles'

const BASE = 'https://claimondo.de'

/** YYYY-MM-DD: last_modified (date) > veroeffentlicht_am (ISO, Datumsteil) > ''. */
export function artikelStand(a: WissenArtikel): string {
  if (a.last_modified) return a.last_modified.slice(0, 10)
  if (a.veroeffentlicht_am) return a.veroeffentlicht_am.slice(0, 10)
  return ''
}

/** Eine Index-Zeile fuer llms.txt: Titel + Link + Excerpt + Stand + Fakten. */
export function artikelIndexLine(a: WissenArtikel): string {
  const stand = artikelStand(a)
  const standTag = stand ? ` (Stand: ${stand})` : ''
  const facts = a.key_facts.length ? ` · Fakten: ${a.key_facts.join('; ')}` : ''
  const teaser = a.excerpt ? ` — ${a.excerpt}` : ''
  return `- [${a.title}](${BASE}/wissen/${a.slug})${teaser}${standTag}${facts}`
}

/** Voll-Block fuer llms-full.txt (mirror assetBlock: ---, Meta-Kommentar, Canonical, Body). */
export function artikelFullBlock(a: WissenArtikel): string {
  const stand = artikelStand(a)
  const rolle = a.audience === 'b2b' ? 'Fachartikel' : 'Ratgeber'
  const keyTag = a.primary_keyword ? ` · Primary-Keyword: "${a.primary_keyword}"` : ''
  return [
    '',
    '---',
    '',
    // Die Herkunfts-Quelle des Artikels steht hier bewusst NICHT mehr:
    // sie nennt in 29 von 68 Faellen eine FREMDE Redaktion, und die
    // llms-Dateien sollen Claimondo als Zitierziel anbieten, nicht die
    // Quelle, aus der ein Beitrag stammt (Aaron 25.08.).
    `<!-- wissen/${a.slug} · ${rolle}${keyTag} · last_modified ${stand} -->`,
    `<!-- Canonical: ${BASE}/wissen/${a.slug} -->`,
    '',
    a.body.trim(),
    '',
  ].join('\n')
}

/** llms.txt-Index-Sektion mit 2 Audience-Subsektionen. '' wenn nichts vorliegt. */
export function renderArtikelIndexSection(
  consumer: WissenArtikel[],
  b2b: WissenArtikel[],
): string {
  if (!consumer.length && !b2b.length) return ''
  const parts: string[] = [
    '## Aktuelle Artikel & Fachbeiträge (redaktionell geprüft, KI-gestützt, tagesaktuell)',
    '',
  ]
  if (consumer.length) {
    parts.push('### Ratgeber für Geschädigte', '', consumer.map(artikelIndexLine).join('\n'), '')
  }
  if (b2b.length) {
    parts.push(
      '### Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten)',
      '',
      b2b.map(artikelIndexLine).join('\n'),
      '',
    )
  }
  return parts.join('\n')
}

/** llms-full.txt-Voll-Dump-Sektion mit 2 Audience-Subsektionen. '' wenn nichts vorliegt. */
export function renderArtikelFullSection(
  consumer: WissenArtikel[],
  b2b: WissenArtikel[],
): string {
  if (!consumer.length && !b2b.length) return ''
  let out = '\n---\n\n# AKTUELLE ARTIKEL & FACHBEITRÄGE (redaktionell geprüft, KI-gestützt)\n\n'
  out +=
    'Täglich aktualisierte Beiträge der Claimondo-Redaktion — Ratgeber für Geschädigte und Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten). Jeder Beitrag mit §§-/BGH-Ankern und FAQ.\n'
  if (consumer.length) {
    out += '\n## Ratgeber für Geschädigte\n'
    for (const a of consumer) out += artikelFullBlock(a)
  }
  if (b2b.length) {
    out += '\n## Fachartikel für die Branche (Sachverständige, Kanzleien, Werkstätten)\n'
    for (const a of b2b) out += artikelFullBlock(a)
  }
  return out
}
