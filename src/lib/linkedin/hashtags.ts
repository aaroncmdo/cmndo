// src/lib/linkedin/hashtags.ts
const BASE = ['#KfzGutachten', '#Schadensregulierung', '#Verkehrsrecht']
const BY_TYPE: Record<string, string[]> = {
  Cornerstone: [...BASE, '#Kfz'],
  Spoke: [...BASE, '#Haftpflicht'],
  Decoder: [...BASE, '#Schadengutachten'],
  Sachverständige: ['#Sachverständiger', '#KfzGutachter', '#Verkehrsrecht'],
  Stadt: ['#KfzGutachter', '#Schadensregulierung', '#Unfall'],
  Strategic: [...BASE, '#Unfallregulierung'],
}
export function hashtagsFor(assetType: string): string[] {
  return BY_TYPE[assetType] ?? BASE
}
