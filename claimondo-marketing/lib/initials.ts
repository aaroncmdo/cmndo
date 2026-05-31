/**
 * Initialen aus einem Namen (max. 2 Zeichen) — Fallback fuer Logo-Slots ohne
 * hinterlegtes Markenlogo (K11; keine Markenrechtsverletzung). Genutzt vom
 * Versicherer-Hub-Index und der AuthorBox.
 */
export function getInitials(name: string): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}
