// AAR-428 / W4: Welche Sections/Tabs für welche Rolle sichtbar?
//
// Die FallakteShell rendert 5 Haupt-Tabs. KB und Admin teilen die gleichen
// Routen, aber KB soll z.B. keine Abrechnung sehen. Die Filter-Logik liegt
// hier — die Shell importiert nur `getVisibleTabs(rolle)`.

import type { FallakteRolle } from '@/lib/fall/field-permissions'
import { canPerform } from './permissions'

export type FallTabId = 'uebersicht' | 'dokumente' | 'kommunikation' | 'prozess' | 'timeline'

export const ALL_TABS: FallTabId[] = [
  'uebersicht',
  'dokumente',
  'kommunikation',
  'prozess',
  'timeline',
]

/**
 * Gibt die sichtbaren Tab-IDs für eine Rolle zurück.
 * Aktuell sieht jeder mit Admin-Portal-Zugang alle 5 Tabs — die Filter-
 * Granularität passiert innerhalb der Tabs (z.B. Abrechnungs-Block im
 * Prozess-Tab ist für KB ausgeblendet via canPerform('canViewAbrechnung')).
 * Die Liste existiert trotzdem explizit, damit Folge-Tickets (AAR-446)
 * einfach einzelne Tabs gaten können.
 */
export function getVisibleTabs(rolle: FallakteRolle | null | undefined): FallTabId[] {
  if (!rolle) return []
  // Zukünftig: if (!canPerform('canViewAbrechnung', rolle)) filter aus 'abrechnung'
  void canPerform // explizit halten damit TS ihn nicht entfernt
  return ALL_TABS
}
