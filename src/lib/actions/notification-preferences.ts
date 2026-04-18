'use server'

// AAR-500 N5: Server-Action zum Speichern der Benachrichtigungs-Präferenzen.
// Wird aus den Settings-Sections der Portale (Kunde/SV/Makler) aufgerufen.
// RLS erlaubt nur self-Write — der server-seitige Supabase-Client nutzt den
// authentifizierten User automatisch.

import { createClient } from '@/lib/supabase/server'
import type { Channel, EventType } from '@/lib/notifications/types'

export type UpdatePreferencesInput = {
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  timezone?: string | null
  channel_opt_outs?: Channel[]
  event_opt_outs?: Partial<Record<EventType, Channel[]>>
}

const ALLOWED_CHANNELS: readonly Channel[] = ['whatsapp', 'email', 'web_push', 'native_push', 'in_app']

function sanitizeTime(input: string | null | undefined): string | null {
  if (!input) return null
  const trimmed = String(input).trim()
  if (!trimmed) return null
  // HH:MM oder HH:MM:SS
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(trimmed)) return null
  const [h, m] = trimmed.split(':')
  const hh = Number(h)
  const mm = Number(m)
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`
}

function sanitizeChannels(list: unknown): Channel[] {
  if (!Array.isArray(list)) return []
  const out: Channel[] = []
  for (const item of list) {
    if (typeof item === 'string' && (ALLOWED_CHANNELS as readonly string[]).includes(item)) {
      out.push(item as Channel)
    }
  }
  return Array.from(new Set(out))
}

function sanitizeEventOptOuts(input: unknown): Partial<Record<EventType, Channel[]>> {
  if (!input || typeof input !== 'object') return {}
  const out: Partial<Record<EventType, Channel[]>> = {}
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const channels = sanitizeChannels(value)
    if (channels.length) out[key as EventType] = channels
  }
  return out
}

export async function updateNotificationPreferences(
  input: UpdatePreferencesInput,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'unauthorized' }

  const payload = {
    user_id: user.id,
    quiet_hours_start: sanitizeTime(input.quiet_hours_start),
    quiet_hours_end: sanitizeTime(input.quiet_hours_end),
    timezone: typeof input.timezone === 'string' && input.timezone.trim()
      ? input.timezone.trim()
      : 'Europe/Berlin',
    channel_opt_outs: sanitizeChannels(input.channel_opt_outs),
    event_opt_outs: sanitizeEventOptOuts(input.event_opt_outs),
    updated_at: new Date().toISOString(),
  }

  const { error } = await supabase
    .from('notification_preferences')
    .upsert(payload, { onConflict: 'user_id' })

  if (error) {
    console.error('[updateNotificationPreferences] upsert failed', error)
    return { success: false, error: error.message }
  }
  return { success: true }
}

export async function getMyNotificationPreferences(): Promise<{
  success: boolean
  error?: string
  prefs?: {
    quiet_hours_start: string | null
    quiet_hours_end: string | null
    timezone: string
    channel_opt_outs: Channel[]
    event_opt_outs: Partial<Record<EventType, Channel[]>>
  }
}> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { success: false, error: 'unauthorized' }

  const { data, error } = await supabase
    .from('notification_preferences')
    .select('quiet_hours_start, quiet_hours_end, timezone, channel_opt_outs, event_opt_outs')
    .eq('user_id', user.id)
    .maybeSingle()

  if (error) return { success: false, error: error.message }

  return {
    success: true,
    prefs: {
      quiet_hours_start: (data?.quiet_hours_start as string | null) ?? null,
      quiet_hours_end: (data?.quiet_hours_end as string | null) ?? null,
      timezone: (data?.timezone as string) ?? 'Europe/Berlin',
      channel_opt_outs: sanitizeChannels(data?.channel_opt_outs),
      event_opt_outs: sanitizeEventOptOuts(data?.event_opt_outs),
    },
  }
}
