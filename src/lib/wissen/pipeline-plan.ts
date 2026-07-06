// Reine Entscheidungs-Helfer für die getierte B2B-Pipeline. Kein IO — unit-testbar.

export type PlanThema = {
  id: string
  quelle: string
  titel: string
  kurzbrief: string | null
  primary_keyword: string | null
  cluster: string | null
  artikel_typ: string | null
  source_url: string | null
  created_at: string
}

/** Priorität: Crawl (tagesaktuell) → Manuell (Aarons Vorschläge) → Evergreen (Boden). */
export function orderCandidates(pools: {
  crawl: PlanThema[]
  manuell: PlanThema[]
  evergreen: PlanThema[]
}): PlanThema[] {
  return [...pools.crawl, ...pools.manuell, ...pools.evergreen]
}

/** Wie viele frische Evergreen-Themen proponieren, um die Queue auf `target` zu bringen. */
export function evergreenRefillCount(poolLen: number, target: number): number {
  return Math.max(0, target - poolLen)
}

/** Evergreen nur bis zum Tages-Boden ziehen — nicht überpublizieren. */
export function shouldStopEvergreen(quelle: string, published: number, dailyMin: number): boolean {
  return quelle === 'ai_gap' && published >= dailyMin
}

/** Themen-Provenienz → Artikel-quelle (Constraint: redaktion|crawl|ai_gap). */
export function articleQuelleForThema(themaQuelle: string): 'crawl' | 'redaktion' | 'ai_gap' {
  if (themaQuelle === 'crawl') return 'crawl'
  if (themaQuelle === 'manuell') return 'redaktion'
  return 'ai_gap'
}
