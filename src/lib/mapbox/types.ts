// AAR-380: Re-Exports der Field-Modus-Mapbox-Types.
// Zentraler Import-Pfad für Consumer (`import { ... } from '@/lib/mapbox/types'`).

export type {
  FieldModusMapConfig,
  MarkerSkin,
} from '@/lib/types/field-modus'

import type { FieldModusMapConfig } from '@/lib/types/field-modus'
import { MAPBOX_STYLE_STANDARD } from './styles'

export const DEFAULT_FIELD_MAP_CONFIG: FieldModusMapConfig = {
  style: MAPBOX_STYLE_STANDARD,
  initialZoom: 15,
  pitch: 60,
  bearing: 0,
  use3dBuildings: true,
}
