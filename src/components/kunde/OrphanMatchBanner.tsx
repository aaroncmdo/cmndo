// Identitaets-Engine §12 Login-Tor — Slice B Self-Confirm Banner (Server-Teil).
//
// Laeuft im Kunde-Layout: ruft die read-only Match-Detection (Slice A,
// findOrphanPersonMatchesForUser) via Service-Client — match_person_candidates ist
// service_role-only — und rendert den Client-Hinweis NUR, wenn ein starker/verifizierter
// Kandidat existiert (minTier 'stark', §13-A: kein weicher Match -> keine Aufforderung).
//
// Non-critical: jeder Fehler -> null (das Layout darf nie an dieser Detection haengen).
// Perf-Hinweis: laeuft pro /kunde/*-Load; der Match ist ein kleiner personen-Scan und
// liefert im Normalfall 0 Kandidaten -> null. Eine spaetere Cookie-Gate-Optimierung
// (nach Dismiss nicht erneut fragen) ist denkbar, fuer den MVP nicht noetig.

import { createAdminClient } from '@/lib/supabase/admin'
import { findOrphanPersonMatchesForUser } from '@/lib/personen/find-orphan-matches'
import OrphanMatchBannerClient from './OrphanMatchBannerClient'

export default async function OrphanMatchBanner({ userId }: { userId: string }) {
  let topOrphanId: string | null = null
  try {
    const admin = createAdminClient()
    const res = await findOrphanPersonMatchesForUser({ db: admin, userId, minTier: 'stark' })
    if (res.ok && res.matches.length > 0) {
      topOrphanId = res.matches[0].personId
    }
  } catch (e) {
    console.error('[OrphanMatchBanner] Match-Detection fehlgeschlagen:', e)
  }

  if (!topOrphanId) return null
  return <OrphanMatchBannerClient orphanPersonId={topOrphanId} />
}
