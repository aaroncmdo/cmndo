import type { SegmentVisual } from './schema'

/**
 * Visual-Resolver: loest den Visual-Plan eines Segments auf, mit Prioritaet
 *   1. kuratierte Marken-Bibliothek (Remotion-Branded-Component per Tag)
 *   2. Stock (Pexels, gratis)
 *   3. generische Grafik (Remotion-Fallback)
 * Nie null -> jeder Clip bleibt gefuellt. Deps sind injizierbar (Tests + Teil B7 liefert die echte Bibliothek).
 */

export type ResolvedVisual =
  | { kind: 'brand'; ref: string } // Marken-Component-ID (Remotion)
  | { kind: 'stock'; ref: string } // Stock-Video-URL/-Pfad
  | { kind: 'graphic' } // reine Remotion-Grafik

export interface BrandLibrary {
  /** liefert eine Marken-Component-ID fuer die Tags, oder null */
  find(tags: string[]): string | null
}
export interface StockFetcher {
  /** liefert eine Stock-Video-URL/-Pfad fuer die Queries, oder null */
  fetch(queries: string[]): Promise<string | null>
}

export async function resolveVisual(
  plan: SegmentVisual,
  brandLib: BrandLibrary,
  stock: StockFetcher,
): Promise<ResolvedVisual> {
  if (plan.tags?.length) {
    const brandRef = brandLib.find(plan.tags)
    if (brandRef) return { kind: 'brand', ref: brandRef }
  }
  if (plan.queries?.length) {
    const stockRef = await stock.fetch(plan.queries)
    if (stockRef) return { kind: 'stock', ref: stockRef }
  }
  return { kind: 'graphic' }
}

interface PexelsVideoFile {
  link: string
  width: number
  height: number
}
interface PexelsVideo {
  video_files: PexelsVideoFile[]
}

/** Pexels-Stock-Fetcher (Port PoC broll.mjs): erste passende Portrait-Video-URL. */
export const pexelsStockFetcher: StockFetcher = {
  async fetch(queries: string[]): Promise<string | null> {
    const key = process.env.PEXELS_API_KEY
    if (!key) return null
    for (const q of queries) {
      const res = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(q)}&orientation=portrait&size=medium&per_page=1`,
        { headers: { Authorization: key } },
      )
      if (!res.ok) continue
      const data = (await res.json()) as { videos?: PexelsVideo[] }
      const vid = data.videos?.[0]
      if (!vid) continue
      const file =
        vid.video_files.filter((f) => f.height >= f.width).sort((a, b) => b.height - a.height)[0] ??
        vid.video_files[0]
      if (file?.link) return file.link
    }
    return null
  },
}
