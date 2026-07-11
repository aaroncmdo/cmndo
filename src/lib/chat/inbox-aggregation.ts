// Reine Aggregations-Logik fuer den globalen Posteingang-FAB (Phase 2b DEEPER).
// Thread-nativ statt kanal-basiert: die Route laedt kunde_gruppe-Thread-Nachrichten +
// Claim-Meta + Unread-Counts und ruft aggregiereInbox — hier liegt die testbare Logik
// (neueste Nachricht pro Claim, Skip ohne Store-Key, Sortierung), die I/O bleibt in der Route.

export type InboxThread = {
  fallId: string
  /** claim-nativ (Phase 2b): der v2-Thread des Fensters wird ueber die claim_id aufgeloest. */
  claimId: string
  fallNummer: string | null
  kundeName: string
  lastMessage: string
  lastAt: string
  unreadCount: number
}

/** Eine Thread-Nachricht, reduziert auf das fuer die Inbox Noetige (Reihenfolge egal). */
export type AggMessage = {
  claimId: string
  nachricht: string | null
  createdAt: string
}

/** Aufgeloeste Claim-Metadaten (fallId = Store-Key des FAB). */
export type AggClaimMeta = {
  claimId: string
  fallId: string | null
  fallNummer: string | null
  kundeName: string
}

/**
 * Baut die Inbox-Thread-Liste: neueste Nachricht je Claim, Claims ohne Store-Key
 * (fehlende Meta oder fehlende fallId) werden uebersprungen, Sortierung ungelesen-zuerst
 * dann nach Aktualitaet (desc).
 */
export function aggregiereInbox(
  messages: AggMessage[],
  claimMeta: Map<string, AggClaimMeta>,
  unreadByClaim: Record<string, number>,
): InboxThread[] {
  // Neueste Nachricht je Claim (ordnungsunabhaengig ueber created_at).
  const latest = new Map<string, AggMessage>()
  for (const m of messages) {
    const cur = latest.get(m.claimId)
    if (!cur || new Date(m.createdAt).getTime() > new Date(cur.createdAt).getTime()) {
      latest.set(m.claimId, m)
    }
  }

  const threads: InboxThread[] = []
  for (const [claimId, m] of latest) {
    const meta = claimMeta.get(claimId)
    if (!meta || !meta.fallId) continue // ohne fall_id kein Store-Key -> ueberspringen
    threads.push({
      fallId: meta.fallId,
      claimId,
      fallNummer: meta.fallNummer,
      kundeName: meta.kundeName,
      lastMessage: m.nachricht ?? '',
      lastAt: m.createdAt,
      unreadCount: unreadByClaim[claimId] ?? 0,
    })
  }

  threads.sort((a, b) => {
    if ((a.unreadCount > 0) !== (b.unreadCount > 0)) return a.unreadCount > 0 ? -1 : 1
    return new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime()
  })

  return threads
}
