// AAR-497 N2: Fan-Out. Nimmt ein Event + Default-Matrix und löst konkrete
// Empfänger-Channels auf. Für task.*/makler.*/dokument.hochgeladen/nachricht.*
// gelten Sonderregeln (siehe Notion-Taxonomie §5.9/§5.10/§5.11).

import { createAdminClient } from '@/lib/supabase/admin'
import { EVENT_MATRIX } from './channel-matrix'
import type {
  Channel,
  EventType,
  NotificationEvent,
  Recipient,
  Role,
} from './types'

type FallParticipants = {
  kundeUserId: string | null
  svUserId: string | null
  kundenbetreuerUserId: string | null
  maklerUserIds: string[]
  adminUserIds: string[]
}

async function loadClaimParticipants(claimId: string): Promise<FallParticipants> {
  const supabase = createAdminClient()

  // CMM-49 claim-native: claim_id ist der kanonische Event-Key -> claims direkt lesen (kein
  // resolveClaimId-fall_id-Umweg mehr; computeRecipients gatet jetzt auf event.claim_id).
  const { data: fallClaim } = await supabase
    .from('claims')
    .select('geschaedigter_user_id, sv_id, kundenbetreuer_id')
    .eq('id', claimId)
    .maybeSingle()

  let svUserId: string | null = null
  if (fallClaim?.sv_id) {
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fallClaim.sv_id)
      .maybeSingle()
    svUserId = sv?.profile_id ?? null
  }

  // Makler mit aktivem Consent auf diesem Claim. makler_fall_consent ist claim-native gekeyt
  // (claim_id backfilled) -> direkt auf claim_id matchen statt ueber fall_id.
  const { data: consents } = await supabase
    .from('makler_fall_consent')
    .select('makler:makler(user_id)')
    .eq('claim_id', claimId)
    .is('widerrufen_am', null)

  const maklerUserIds = (consents ?? [])
    .map((c) => {
      const m = Array.isArray(c.makler) ? c.makler[0] : c.makler
      return (m as { user_id?: string | null } | null)?.user_id ?? null
    })
    .filter((id): id is string => !!id)

  const { data: admins } = await supabase
    .from('profiles')
    .select('id')
    .eq('rolle', 'admin')
  const adminUserIds = (admins ?? []).map((a) => a.id as string)

  return {
    kundeUserId: fallClaim?.geschaedigter_user_id ?? null,
    svUserId,
    kundenbetreuerUserId: fallClaim?.kundenbetreuer_id ?? null,
    maklerUserIds,
    adminUserIds,
  }
}

/** Extrahiert self-notification-User aus dem Payload (sollte nicht benachrichtigt werden). */
function selfNotifyUserId(event: NotificationEvent): string | null {
  const payload = event.payload as Record<string, unknown>
  switch (event.event_type) {
    case 'dokument.hochgeladen':
      return typeof payload.uploadedByUserId === 'string' ? payload.uploadedByUserId : null
    case 'nachricht.received':
      return typeof payload.senderUserId === 'string' ? payload.senderUserId : null
    default:
      return event.triggered_by_user_id
  }
}

function addRecipient(
  map: Map<string, { role: Role; channels: Set<Channel> }>,
  userId: string,
  role: Role,
  channels: Channel[],
) {
  if (!channels.length) return
  const existing = map.get(userId)
  if (existing) {
    channels.forEach((c) => existing.channels.add(c))
  } else {
    map.set(userId, { role, channels: new Set(channels) })
  }
}

/**
 * Berechnet die Empfänger-Liste für ein Event. Nutzt die Default-Channel-Matrix
 * aus channel-matrix.ts als Basis. N5 (Preferences) wird später pro User
 * Overrides über Preferences-Tabelle legen.
 */
export async function computeRecipients(event: NotificationEvent): Promise<Recipient[]> {
  const config = EVENT_MATRIX[event.event_type as EventType]
  if (!config) {
    console.warn('[fan-out] no matrix config for event_type', event.event_type)
    return []
  }

  const map = new Map<string, { role: Role; channels: Set<Channel> }>()
  const payload = event.payload as Record<string, unknown>

  // ── Sonderfälle ─────────────────────────────────────────────────────────
  // 5.9 Tasks: Nur empfaengerUserId aus Payload (direkter Empfänger).
  if (event.event_type === 'task.created' || event.event_type === 'task.due') {
    const empfaengerUserId =
      typeof payload.empfaengerUserId === 'string' ? payload.empfaengerUserId : null
    const empfaengerRolle =
      typeof payload.empfaengerRolle === 'string' ? (payload.empfaengerRolle as Role) : null
    if (empfaengerUserId && empfaengerRolle) {
      const channels = config.channels[empfaengerRolle] ?? []
      addRecipient(map, empfaengerUserId, empfaengerRolle, channels)
    }
    // Admin-in_app (falls konfiguriert).
    if (event.claim_id && config.channels.admin?.length) {
      const p = await loadClaimParticipants(event.claim_id)
      for (const adminId of p.adminUserIds) {
        addRecipient(map, adminId, 'admin', config.channels.admin)
      }
    }
    return flatten(map, selfNotifyUserId(event))
  }

  // 5.11 Makler-Events: Nur der spezifische Makler (maklerId aus Payload) + Admin.
  if (event.event_type === 'makler.lead_eingegangen' || event.event_type === 'makler.provision_status') {
    const maklerId = typeof payload.maklerId === 'string' ? payload.maklerId : null
    if (maklerId) {
      const supabase = createAdminClient()
      const { data: makler } = await supabase
        .from('makler')
        .select('user_id')
        .eq('id', maklerId)
        .maybeSingle()
      if (makler?.user_id) {
        const channels = config.channels.makler ?? []
        addRecipient(map, makler.user_id, 'makler', channels)
      }
    }
    // Admin-Channels (z. B. in_app-Protokoll).
    if (config.channels.admin?.length) {
      const supabase = createAdminClient()
      const { data: admins } = await supabase.from('profiles').select('id').eq('rolle', 'admin')
      for (const a of admins ?? []) {
        addRecipient(map, a.id as string, 'admin', config.channels.admin)
      }
    }
    return flatten(map, selfNotifyUserId(event))
  }

  // AAR-826 Gast-Conversion-Reminder: user-basiert (kein Claim). Empfaenger =
  // der Gast selbst (payload.userId), Rolle 'kunde' (Proto-Kunde). Channels aus
  // der Matrix. Muss VOR dem claim-basierten Standard-Fan-Out stehen, sonst
  // faellt das Event mangels claim_id auf 0 Empfaenger.
  if (event.event_type === 'gast.conversion_reminder') {
    const userId = typeof payload.userId === 'string' ? payload.userId : null
    if (userId) {
      addRecipient(map, userId, 'kunde', config.channels.kunde ?? [])
    }
    return flatten(map, selfNotifyUserId(event))
  }

  // ── Standard-Fan-Out: alle Fall-Beteiligten laut Matrix ─────────────────
  // CMM-49 claim-native: gatet auf claim_id (kanonischer Key). emit setzt claim_id immer mit
  // (resolveClaimId), die Invariante „jeder Fall hat einen Claim" haelt -> aequivalent zum alten
  // fall_id-Gate, aber robust gegen fall_id=NULL (genau der P0-Dunkel-Bug 02.-20.06.).
  // Payload-Fallback: DB-Cron-Events (z.B. gutachten.pflicht_fotos_unvollstaendig) schreiben die
  // claim_id NUR in den Payload, nicht in die Spalte -> sonst blieben sie dunkel.
  const effectiveClaimId =
    event.claim_id ??
    (typeof payload.claim_id === 'string' ? payload.claim_id : null) ??
    (typeof payload.claimId === 'string' ? payload.claimId : null)
  if (!effectiveClaimId) {
    console.warn('[fan-out] event has no claim_id — skipping default fan-out', event.id)
    return []
  }

  const p = await loadClaimParticipants(effectiveClaimId)

  if (p.kundeUserId && config.channels.kunde?.length) {
    addRecipient(map, p.kundeUserId, 'kunde', config.channels.kunde)
  }
  if (p.svUserId && config.channels.sachverstaendiger?.length) {
    addRecipient(map, p.svUserId, 'sachverstaendiger', config.channels.sachverstaendiger)
  }
  if (p.kundenbetreuerUserId && config.channels.kundenbetreuer?.length) {
    addRecipient(map, p.kundenbetreuerUserId, 'kundenbetreuer', config.channels.kundenbetreuer)
  }
  if (config.channels.makler?.length) {
    for (const maklerUserId of p.maklerUserIds) {
      addRecipient(map, maklerUserId, 'makler', config.channels.makler)
    }
  }
  if (config.channels.admin?.length) {
    for (const adminId of p.adminUserIds) {
      addRecipient(map, adminId, 'admin', config.channels.admin)
    }
  }

  return flatten(map, selfNotifyUserId(event))
}

function flatten(
  map: Map<string, { role: Role; channels: Set<Channel> }>,
  skipUserId: string | null,
): Recipient[] {
  const out: Recipient[] = []
  for (const [userId, entry] of map.entries()) {
    if (skipUserId && userId === skipUserId) continue
    out.push({ userId, role: entry.role, channels: Array.from(entry.channels) })
  }
  return out
}
