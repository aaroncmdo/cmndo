'use server'

// Identitaets-Engine §12 Login-Tor — Slice B Self-Confirm Server-Action.
//
// Duenner Wrapper um confirmOrphanPersonIsMe mit der HARTEN Authz-Schaerfung:
// die vom Client uebergebene orphanPersonId wird serverseitig re-gecheckt — sie MUSS
// in den aktuellen Match-Kandidaten genau DIESES Users sein (findOrphanPersonMatchesForUser).
// Niemals einer beliebig uebergebenen personId blind re-pointen (sonst Claim-Hijack).
//
// match_person_candidates + der Re-Point sind service_role-only (PII / §2) -> Admin-Client.
// Die userId kommt aus der authentifizierten Session (regulaerer Client), nicht vom Client-Input.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { findOrphanPersonMatchesForUser } from '@/lib/personen/find-orphan-matches'
import { confirmOrphanPersonIsMe } from '@/lib/personen/confirm-orphan-match'

export async function confirmOrphanMatchAction(
  orphanPersonId: string,
): Promise<{ ok: boolean; error?: string }> {
  // 1) Authentifizierter User (Session-Client)
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  if (!orphanPersonId || typeof orphanPersonId !== 'string') {
    return { ok: false, error: 'Ungueltige Anfrage' }
  }

  // 2) Privilegierte Operationen via Service-Client (RPC + Re-Point = service_role-only)
  let admin: ReturnType<typeof createAdminClient>
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[confirmOrphanMatchAction] admin client:', e)
    return { ok: false, error: 'Service nicht verfuegbar' }
  }

  // 3) AUTHZ-Re-Check: orphanPersonId MUSS Kandidat genau dieses Users sein.
  //    minTier 'stark' = nur starke/verifizierte Matches (§13-A). Tombstones sind
  //    durch den match_person_candidates-Filter (canonical_person_id is null) bereits raus.
  const candidates = await findOrphanPersonMatchesForUser({ db: admin, userId: user.id, minTier: 'stark' })
  if (!candidates.ok) return { ok: false, error: candidates.error }
  const isCandidate = candidates.matches.some((m) => m.personId === orphanPersonId)
  if (!isCandidate) {
    return { ok: false, error: 'Kein passender Vorgang gefunden' }
  }

  // 4) Re-Point + Tombstone (Identitaets-Dedup; KEIN Access-Grant — §2: Zugriff bleibt
  //    an user_id/Party-Membership, person_id ist reine Dedup-Ebene).
  const result = await confirmOrphanPersonIsMe({ db: admin, userId: user.id, orphanPersonId })
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/kunde')
  return { ok: true }
}
