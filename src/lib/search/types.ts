// Global-Suche: geteilte Typen (RPC-Result-Shape + gruppierte UI-Struktur).
export type EntityType = 'claim' | 'lead'

// Eine Zeile aus dem search_global-RPC.
export interface SearchHit {
  entity_type: EntityType
  id: string
  label: string
  sub: string | null
  status: string | null
  score: number
}

// Nach entity_type gruppierte, deduplizierte Treffer (fuer die Palette).
export interface SearchGroup {
  entityType: EntityType
  hits: SearchHit[]
}
