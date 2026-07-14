// Projekt A / Slice A2: Zwei-Stufen-Badge-Logik fuer Action-Items.
// »gesehen dimmt, erledigt loescht«: die rote Zahl zaehlt nur UNGESEHENE Action-Items
// (Timestamp > actions_last_seen_at-Cursor des Users). Nach dem Oeffnen des Feeds wird der
// Cursor vorgeschoben -> diese Items gelten als SEEN-open (grau, weiter in der Liste, aber
// nicht mehr in der roten Zahl). Ein Item verschwindet erst, wenn sein DB-State erledigt ist
// (das laeuft weiter ueber get-updates, nicht hier). Pure, keine Seiteneffekte, DB-frei.

export interface SeenSplitItem {
  id: string
  /** ISO-Timestamp (created/updated) des Items — entscheidet ungesehen vs. gesehen. */
  timestamp: string
}

export interface SeenSplitResult {
  /** Anzahl ungesehener Action-Items = die rote Badge-Zahl. */
  unseenCount: number
  unseenIds: string[]
  /** gesehen-aber-offen: grau/gedimmt in der Liste, nicht in der roten Zahl. */
  seenIds: string[]
}

/**
 * Teilt Action-Items in UNGESEHEN (Timestamp strikt nach dem Cursor) vs. GESEHEN-offen
 * (am/vor dem Cursor). Cursor null ODER unlesbar -> der User hat nie »gesehen« markiert ->
 * alles ungesehen. Ein unlesbarer Item-Timestamp -> konservativ UNGESEHEN (nie ein Item
 * wegen eines kaputten Timestamps stumm verstecken).
 */
export function splitActionItemsBySeen(
  items: SeenSplitItem[],
  cursor: string | null,
): SeenSplitResult {
  const cursorMs = cursor ? new Date(cursor).getTime() : null
  const cutoff = cursorMs !== null && Number.isFinite(cursorMs) ? cursorMs : null

  const unseenIds: string[] = []
  const seenIds: string[] = []
  for (const it of items) {
    const t = new Date(it.timestamp).getTime()
    const isUnseen = cutoff === null || !Number.isFinite(t) || t > cutoff
    if (isUnseen) unseenIds.push(it.id)
    else seenIds.push(it.id)
  }
  return { unseenCount: unseenIds.length, unseenIds, seenIds }
}
