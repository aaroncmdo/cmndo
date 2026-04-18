// AAR-500 N5: Preferences-Loader + shouldDeliverToChannel. Wird vom Worker
// (api/notifications/process) pro (user, channel) aufgerufen bevor eine
// Delivery-Row als 'pending' eingetragen wird. Skipped Deliveries bleiben
// dokumentiert (status='skipped' + skip_reason) für Audit.
//
// Priorität der Checks:
//   1. channel_opt_outs  → 'channel_opted_out'
//   2. event_opt_outs    → 'event_opted_out'
//   3. quiet_hours       → 'quiet_hours' (außer priority='urgent')

import { createAdminClient } from '@/lib/supabase/admin'
import type { Channel, EventType, Priority } from './types'

export type NotificationPreferences = {
  user_id: string
  quiet_hours_start: string | null // 'HH:MM:SS' oder null
  quiet_hours_end: string | null
  timezone: string
  channel_opt_outs: Channel[]
  event_opt_outs: Partial<Record<EventType, Channel[]>>
}

const DEFAULT_PREFS: Omit<NotificationPreferences, 'user_id'> = {
  quiet_hours_start: null,
  quiet_hours_end: null,
  timezone: 'Europe/Berlin',
  channel_opt_outs: [],
  event_opt_outs: {},
}

function normaliseChannelList(value: unknown): Channel[] {
  if (!Array.isArray(value)) return []
  return value.filter((v): v is Channel => typeof v === 'string') as Channel[]
}

function normaliseEventOptOuts(value: unknown): Partial<Record<EventType, Channel[]>> {
  if (!value || typeof value !== 'object') return {}
  const out: Partial<Record<EventType, Channel[]>> = {}
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const chans = normaliseChannelList(v)
    if (chans.length) out[k as EventType] = chans
  }
  return out
}

/**
 * Lädt Preferences des Users. Kein Record → alle Default-Werte (opt-in).
 * Bei Makler-Usern werden existierende Email-Opt-Outs aus makler.notification_preferences
 * als schwacher Fallback berücksichtigt (wenn N5-Table leer, Makler hat Email-Opt-Out
 * für einen Key → wir tragen Email als event_opt_outs für den passenden Event-Typ ein).
 */
export async function loadPreferences(userId: string): Promise<NotificationPreferences> {
  const supabase = createAdminClient()

  const { data: row } = await supabase
    .from('notification_preferences')
    .select('user_id, quiet_hours_start, quiet_hours_end, timezone, channel_opt_outs, event_opt_outs')
    .eq('user_id', userId)
    .maybeSingle()

  if (row) {
    return {
      user_id: userId,
      quiet_hours_start: (row.quiet_hours_start as string | null) ?? null,
      quiet_hours_end: (row.quiet_hours_end as string | null) ?? null,
      timezone: (row.timezone as string) ?? DEFAULT_PREFS.timezone,
      channel_opt_outs: normaliseChannelList(row.channel_opt_outs),
      event_opt_outs: normaliseEventOptOuts(row.event_opt_outs),
    }
  }

  const fallback = await loadMaklerEmailFallback(userId)
  return {
    user_id: userId,
    ...DEFAULT_PREFS,
    event_opt_outs: fallback,
  }
}

/**
 * Makler-Fallback: Liest die alten boolean-Flags aus makler.notification_preferences
 * (AAR-492) und mapped sie auf N5-event_opt_outs (Email) wenn der Flag false ist.
 */
async function loadMaklerEmailFallback(userId: string): Promise<Partial<Record<EventType, Channel[]>>> {
  const supabase = createAdminClient()
  const { data: makler } = await supabase
    .from('makler')
    .select('notification_preferences')
    .eq('user_id', userId)
    .maybeSingle()

  const prefs = makler?.notification_preferences as Record<string, unknown> | null | undefined
  if (!prefs || typeof prefs !== 'object') return {}

  const optOuts: Partial<Record<EventType, Channel[]>> = {}
  // neuer_lead → makler.lead_eingegangen
  if (prefs.neuer_lead === false) {
    optOuts['makler.lead_eingegangen'] = ['email']
  }
  // kanzlei_uebergabe → kanzlei.uebergabe
  if (prefs.kanzlei_uebergabe === false) {
    optOuts['kanzlei.uebergabe'] = ['email']
  }
  // provision_freigegeben → makler.provision_status
  if (prefs.provision_freigegeben === false) {
    optOuts['makler.provision_status'] = ['email']
  }
  return optOuts
}

/**
 * Parse 'HH:MM:SS' oder 'HH:MM' zu Minuten-seit-00:00. Null wenn ungültig.
 */
function timeToMinutes(s: string | null): number | null {
  if (!s) return null
  const parts = s.split(':')
  if (parts.length < 2) return null
  const h = Number(parts[0])
  const m = Number(parts[1])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  return h * 60 + m
}

/**
 * Konvertiert `now` in die Zeitzone des Users und gibt Minuten-seit-00:00 zurück.
 * Nutzt Intl.DateTimeFormat für korrekte DST-Handhabung.
 */
function localMinutes(now: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    const parts = fmt.formatToParts(now)
    const h = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
    const m = Number(parts.find((p) => p.type === 'minute')?.value ?? '0')
    return h * 60 + m
  } catch {
    // Invalid Timezone → UTC-Fallback
    return now.getUTCHours() * 60 + now.getUTCMinutes()
  }
}

export function isInQuietHours(now: Date, prefs: Pick<NotificationPreferences, 'quiet_hours_start' | 'quiet_hours_end' | 'timezone'>): boolean {
  const start = timeToMinutes(prefs.quiet_hours_start)
  const end = timeToMinutes(prefs.quiet_hours_end)
  if (start === null || end === null) return false
  if (start === end) return false // gleicher Start/End = deaktiviert

  const current = localMinutes(now, prefs.timezone)

  if (start < end) {
    // z. B. 13:00 – 14:00
    return current >= start && current < end
  }
  // Umlaufend z. B. 22:00 – 07:00
  return current >= start || current < end
}

export type DeliveryDecision = { deliver: boolean; skipReason?: string }

export async function shouldDeliverToChannel(
  userId: string,
  eventType: EventType,
  channel: Channel,
  priority: Priority,
  now: Date = new Date(),
): Promise<DeliveryDecision> {
  const prefs = await loadPreferences(userId)

  if (prefs.channel_opt_outs.includes(channel)) {
    return { deliver: false, skipReason: 'channel_opted_out' }
  }
  const eventChannels = prefs.event_opt_outs[eventType]
  if (eventChannels && eventChannels.includes(channel)) {
    return { deliver: false, skipReason: 'event_opted_out' }
  }
  if (priority !== 'urgent' && isInQuietHours(now, prefs)) {
    return { deliver: false, skipReason: 'quiet_hours' }
  }
  return { deliver: true }
}

/**
 * Batch-Variante für den Worker: Lädt Preferences eines Users einmal und
 * wertet mehrere (eventType, channel, priority)-Paare aus. Vermeidet
 * N+1-Queries beim Fan-out.
 */
export async function decideDeliveries(
  userId: string,
  items: Array<{ eventType: EventType; channel: Channel; priority: Priority }>,
  now: Date = new Date(),
): Promise<DeliveryDecision[]> {
  const prefs = await loadPreferences(userId)
  const quiet = isInQuietHours(now, prefs)
  return items.map(({ eventType, channel, priority }) => {
    if (prefs.channel_opt_outs.includes(channel)) {
      return { deliver: false, skipReason: 'channel_opted_out' }
    }
    const eventChannels = prefs.event_opt_outs[eventType]
    if (eventChannels && eventChannels.includes(channel)) {
      return { deliver: false, skipReason: 'event_opted_out' }
    }
    if (priority !== 'urgent' && quiet) {
      return { deliver: false, skipReason: 'quiet_hours' }
    }
    return { deliver: true }
  })
}
