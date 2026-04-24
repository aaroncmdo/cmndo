// AAR-543 (C6): Sichtbarkeits-Map für die 8 Prozess-Tab Sections.
// AAR-745 (Phase A): Generalisiert in section-visibility.ts —
// alle 3 Portale nutzen jetzt dieselbe Quelle. Diese Datei ist ein
// Kompatibilitäts-Wrapper. Neue Consumer bitte `getVisibleFallSections`
// (rolle='admin' für Admin) direkt importieren.

import type { SubphaseResult } from './subphase-resolver'
import {
  getVisibleFallSections,
  type FallSectionKey,
} from './section-visibility'

/** @deprecated AAR-745: Nutze FallSectionKey aus section-visibility.ts */
export type ProzessSection = FallSectionKey

/**
 * @deprecated AAR-745 (Phase A): durch `getVisibleFallSections(fall, 'admin', subphase)`
 * ersetzt. Wrapper bleibt bestehen, damit bestehende Consumer nicht brechen.
 * Löschen wenn alle Call-Sites migriert sind.
 */
export function getVisibleProzessSections(
  subphase: SubphaseResult,
  fall: Record<string, unknown>,
): ProzessSection[] {
  return getVisibleFallSections(fall, 'admin', subphase)
}
