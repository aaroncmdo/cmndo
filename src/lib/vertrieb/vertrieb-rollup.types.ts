// src/lib/vertrieb/vertrieb-rollup.types.ts
import type { VertriebKind } from './vertrieb-kontakt.types'
import type { VertriebStufe } from '@/lib/status/domains/vertrieb-workflow'

/** Eine Rollup-Zelle: Anzahl Kontakte je (kind × stufe). Owner-Dimension folgt in P1
 *  (SV/sv-lead haben heute keine Owner-Spalte). */
export type VertriebRollupZelle = {
  kind: VertriebKind
  stufe: VertriebStufe
  anzahl: number
}
