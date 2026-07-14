import type { SearchHit, SearchGroup, EntityType } from './types'

const ORDER: EntityType[] = ['claim', 'lead']

// Dedupliziert Treffer per (entity_type, id) — derselbe Fall kann aus claim_nummer,
// Kennzeichen ODER Person-Name matchen; der hoechste score gewinnt. Danach nach
// entity_type gruppiert, je Gruppe nach score absteigend sortiert.
export function dedupeAndGroup(hits: SearchHit[]): SearchGroup[] {
  const best = new Map<string, SearchHit>()
  for (const h of hits) {
    const key = `${h.entity_type}:${h.id}`
    const prev = best.get(key)
    if (!prev || h.score > prev.score) best.set(key, h)
  }
  const byType = new Map<EntityType, SearchHit[]>()
  for (const h of best.values()) {
    const arr = byType.get(h.entity_type) ?? []
    arr.push(h)
    byType.set(h.entity_type, arr)
  }
  return ORDER.filter(t => byType.has(t)).map(t => ({
    entityType: t,
    hits: byType.get(t)!.sort((a, b) => b.score - a.score),
  }))
}
