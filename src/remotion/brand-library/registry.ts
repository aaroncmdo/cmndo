import type { BrandLibrary } from '../../lib/marketing/visual-resolver'
import { BRAND_KEYS, type BrandKey } from './keys'

/**
 * Kuratierte Marken-Bibliothek (Slice-1-Startcharge). Mappt Visual-Plan-Tags auf
 * gebrandete Remotion-Component-Keys. Server-safe (kein Remotion-Import) - wird vom
 * Render-Orchestrator via resolveVisual genutzt. Waechst als Code (weitere Tags/Keys).
 */
const TAG_MAP: Record<string, BrandKey> = {
  warndreieck: 'warndreieck',
  warning: 'warndreieck',
  triangle: 'warndreieck',
  'hazard-triangle': 'warndreieck',
  kennzeichen: 'kennzeichen',
  nummernschild: 'kennzeichen',
  'license-plate': 'kennzeichen',
  'number-plate': 'kennzeichen',
}

export const brandLibrary: BrandLibrary = {
  find(tags: string[]): string | null {
    for (const t of tags) {
      const key = TAG_MAP[t.toLowerCase()]
      if (key && (BRAND_KEYS as readonly string[]).includes(key)) return key
    }
    return null
  },
}
