// context-kpis.ts
import type { VertriebKontakt, VertriebRolle } from '@/lib/vertrieb/vertrieb-kontakt.types'

/** KPIs für die Cockpit-Cards, gescopet auf die aktive Rolle-Pill (DB-Daten, client-seitig gezählt). */
export function computeContextKpis(
  kontakte: VertriebKontakt[],
  rolle: VertriebRolle | 'alle',
): { label: string; wert: number }[] {
  const rows = rolle === 'alle' ? kontakte : kontakte.filter((k) => k.rolle === rolle)
  const zaehle = (pred: (k: VertriebKontakt) => boolean) => rows.filter(pred).length
  return [
    { label: 'Leads', wert: zaehle((k) => k.typ === 'lead') },
    { label: 'Onboarding', wert: zaehle((k) => k.stufe === 'onboarding') },
    { label: 'Aktiv', wert: zaehle((k) => k.stufe === 'aktiv') },
    { label: 'Gesperrt', wert: zaehle((k) => k.stufe === 'gesperrt') },
  ]
}
