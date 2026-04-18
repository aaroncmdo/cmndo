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

async function loadFallParticipants(fallId: string): Promise<FallParticipants> {
  const supabase = createAdminClient()

  const { data: fall } = await supabase
    .from('faelle')
    .select('id, kunde_id, sv_id, kundenbetreuer_id')
    .eq('id', fallId)
    .maybeSingle()

  let svUserId: string | null = null
  if (fall?.sv_id) {
    const { data: sv } = await supabase
      .from('sachverstaendige')
      .select('profile_id')
      .eq('id', fall.sv_id)
      .maybeSingle()
    svUserId = sv?.profile_id ?? null
  }

  // Makler mit aktivem Consent auf diesem Fall.
  const { data: consents } = await supabase
    .from('makler_fall_consent')
    .select('makler:makler(user_id)')
    .eq('fall_id', fallId)
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
    kundeUserId: fall?.kunde_id ?? null,
    svUserId,
    kundenbetreuerUserId: fall?.kundenbetreuer_id ?? null,
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
    if (event.fall_id && config.channels.admin?.length) {
      const p = await loadFallParticipants(event.fall_id)
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

  // ── Standard-Fan-Out: alle Fall-Beteiligten laut Matrix ─────────────────
  if (!event.fall_id) {
    console.warn('[fan-out] event has no fall_id — skipping default fan-out', event.id)
    return []
  }

  const p = await loadFallParticipants(event.fall_id)

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
