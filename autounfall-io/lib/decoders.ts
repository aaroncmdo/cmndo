import { decoders as decodersBase } from '@/content/decoder-data.generated'
import { decodersExtra } from '@/content/decoder-extra.generated'
import type { Decoder } from '@/lib/decoder-types'

export * from '@/lib/decoder-types'

// WP-3-Basis (20) + WP-7-Nachzügler (decoder-extra, 1). Basis zuerst, Nachzügler
// ans Ende — Cluster-Gruppierung (getDecodersByCluster) bleibt stabil.
const decoders: Decoder[] = [...decodersBase, ...decodersExtra]

// Anzeige-Reihenfolge der Cluster im Hub (Schadenregulierungs-Flow).
const CLUSTER_ORDER = ['Verzögerung', 'Kürzungen', 'Gutachter aufdrängen', 'Wertminderung & Co.']

const bySlug = new Map<string, Decoder>(decoders.map((d) => [d.slug, d]))

export function getDecoder(slug: string): Decoder | undefined {
  return bySlug.get(slug)
}
export function getAllDecoders(): Decoder[] {
  return decoders
}
export function getDecoderSlugs(): string[] {
  return decoders.map((d) => d.slug)
}

/** Decoder gruppiert nach Cluster (in CLUSTER_ORDER, Rest alphabetisch). */
export function getDecodersByCluster(): { cluster: string; items: Decoder[] }[] {
  const groups = new Map<string, Decoder[]>()
  for (const d of decoders) {
    const arr = groups.get(d.cluster) ?? []
    arr.push(d)
    groups.set(d.cluster, arr)
  }
  const ordered = [...groups.keys()].sort((a, b) => {
    const ia = CLUSTER_ORDER.indexOf(a)
    const ib = CLUSTER_ORDER.indexOf(b)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b)
  })
  return ordered.map((cluster) => ({ cluster, items: groups.get(cluster)! }))
}
