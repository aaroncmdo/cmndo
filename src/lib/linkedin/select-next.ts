// src/lib/linkedin/select-next.ts
import type { LinkedInFeedItem } from './types'

/** Newest un-posted item wins. `seenGuids` = every guid already in the ledger
 *  (any status, incl. uebersprungen/veroeffentlicht) so it is never re-drafted. */
export function selectNextUnposted(
  items: LinkedInFeedItem[],
  seenGuids: Set<string>,
): LinkedInFeedItem | null {
  const fresh = items.filter((i) => !seenGuids.has(i.guid))
  if (fresh.length === 0) return null
  return fresh.reduce((newest, i) =>
    new Date(i.datePublished).getTime() > new Date(newest.datePublished).getTime() ? i : newest,
  )
}
