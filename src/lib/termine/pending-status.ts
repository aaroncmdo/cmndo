// Kunde-Termin-Funnel T4: die zwei "wartet auf SV-Bestätigung"-Terminstatus als EINE Quelle.
// `dispatch_pending` (Embed-Dead-Pin, assignee sv_lead) + `sv_gesucht` (Portal-Wunschtermin,
// kein Assignee) sind beide "der Kunde hat einen Termin gewählt, ein echter SV wird noch
// zugewiesen" → in der Kunde-Akte "Wunschtermin · wird bestätigt", in der Dispatch-Queue offen.
// Ersetzt die wortgleichen Inline-Dups (KundeTerminDetailClient, TermineRow, StatusZone,
// terminwuensche page/actions, kunde-claim-view). Client- UND server-importierbar (pure).

/** Termin-Status "gewählt, aber SV noch nicht bestätigt/zugewiesen". */
export const PENDING_TERMIN_STATUS = ['dispatch_pending', 'sv_gesucht'] as const

export type PendingTerminStatus = (typeof PENDING_TERMIN_STATUS)[number]

/** true, wenn der Terminstatus einer der Pending-Status ist (null-safe). */
export function istPendingTerminStatus(status: string | null | undefined): status is PendingTerminStatus {
  return status != null && (PENDING_TERMIN_STATUS as readonly string[]).includes(status)
}
