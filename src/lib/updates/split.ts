import type { UpdateItem } from './types'

export type SplitUpdates = {
  actionItems: UpdateItem[]
  infoItems: UpdateItem[]
  actionCount: number
  newInfoCount: number
}

// #updates-rebuild Phase 3: teilt das gemergte Item[] in die zwei UI-Sektionen.
// Badge = actionCount (NUR offene Actions). newInfoCount = Info seit last_seen
// (dezenter Indikator, treibt NICHT den Badge -> keine Unread-Katastrophe).
export function splitUpdates(items: UpdateItem[], lastSeen: string | null): SplitUpdates {
  const actionItems = items.filter(i => i.modus === 'action')
  const infoItems = items.filter(i => i.modus === 'info')
  const newInfoCount = lastSeen
    ? infoItems.filter(i => i.createdAt > lastSeen).length
    : infoItems.length
  return { actionItems, infoItems, actionCount: actionItems.length, newInfoCount }
}

// Typ-Filter fuer die UI-Chips (Alle / Aktivitaet / Nachrichten / Anrufe / Aufgaben).
export type TypFilter = 'alle' | 'event' | 'message' | 'call' | 'task'

export function filterByTyp(items: UpdateItem[], typ: TypFilter): UpdateItem[] {
  return typ === 'alle' ? items : items.filter(i => i.typ === typ)
}

// Action-Items kommen ohne routeUrl (die Derive-RPC kennt die Rolle nicht).
// Hier rollen-bewusst aus dem Kontext aufgeloest (spiegelt autoRouteUrl).
// HINWEIS: kontextId ist die claim_id; die Portal-Routen erwarten dieselbe id
// (Phase-3-Follow-up: gegen die Route-Params verifizieren falls fall_id noetig).
export function routeForKontext(
  kontextTyp: string | null,
  kontextId: string | null,
  rolle: string,
): string | null {
  if (!kontextId) return null
  if (kontextTyp === 'claim' || kontextTyp === 'fall') {
    switch (rolle) {
      case 'kunde': return `/kunde/faelle/${kontextId}`
      case 'sachverstaendiger': return `/gutachter/fall/${kontextId}`
      case 'makler': return `/makler/akten/${kontextId}`
      default: return `/faelle/${kontextId}` // admin/dispatch/kanzlei/kundenbetreuer/werkstatt
    }
  }
  if (kontextTyp === 'lead') return `/dispatch/leads/${kontextId}`
  if (kontextTyp === 'rueckruf') return `/dispatch/rueckrufe?open=${kontextId}`
  return null
}
