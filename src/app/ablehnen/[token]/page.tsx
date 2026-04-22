// AAR-713 Phase 1: Legacy /ablehnen/<token>-Route ersetzt durch Redirect auf
// /sv/termin/<token> (vollständiger SV-Mini-Flow mit Bestätigen/Ablehnen/
// Verschieben). Alte Email-Links bleiben funktionsfähig — Bookmarks auch.
//
// Original-Implementierung lag in /ablehnen/[token]/{page,actions}.tsx +
// /ablehnen/[token]/erfolg — alle gelöscht. Funktion komplett übernommen
// durch /sv/termin/[token]/ + lib/actions/termin-actions.ts.

import { redirect, permanentRedirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function AblehnenLegacyRedirect({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  // 308 Permanent — Email-Clients und Suchmaschinen lernen die neue URL.
  permanentRedirect(`/sv/termin/${token}`)
  // Unreachable, nur damit TypeScript happy ist.
  redirect(`/sv/termin/${token}`)
}
