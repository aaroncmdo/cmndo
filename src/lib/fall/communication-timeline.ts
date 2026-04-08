import { createAdminClient } from '@/lib/supabase/admin'

export type TimelineItem = {
  id: string
  sourceType: 'call' | 'email' | 'chat' | 'system'
  sourceId: string
  zeitpunkt: string
  richtung: 'inbound' | 'outbound' | 'system'
  initiatorName: string
  empfaengerName: string
  preview: string
  status: string
  dauer?: number
  hatTranskript?: boolean
  hatRecording?: boolean
  kiZusammenfassung?: string | null
  bridgeTyp?: string | null
}

export type TimelineFilter = {
  types?: ('call' | 'email' | 'chat' | 'system')[]
  richtung?: 'inbound' | 'outbound'
  limit?: number
  offset?: number
}

/**
 * KFZ-147: Unified Communication Timeline für einen Fall.
 * Merged Calls, Emails, Chat-Nachrichten chronologisch.
 */
export async function getCommunicationTimeline(
  fallId: string,
  filter?: TimelineFilter,
): Promise<TimelineItem[]> {
  const db = createAdminClient()
  const items: TimelineItem[] = []
  const types = filter?.types ?? ['call', 'email', 'chat']

  // 1. Calls
  if (types.includes('call')) {
    const { data: calls } = await db.from('calls')
      .select('id, richtung, status, von_nummer, zu_nummer, gestartet_am, dauer_sekunden, ki_zusammenfassung, transkript_text, recording_url, bridge, initiator_user_id')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(filter?.limit ?? 50)

    for (const c of calls ?? []) {
      items.push({
        id: `call-${c.id}`, sourceType: 'call', sourceId: c.id,
        zeitpunkt: c.gestartet_am ?? '',
        richtung: c.richtung === 'inbound' ? 'inbound' : 'outbound',
        initiatorName: c.von_nummer ?? '—',
        empfaengerName: c.zu_nummer ?? '—',
        preview: c.ki_zusammenfassung?.slice(0, 120) ?? `Anruf (${c.dauer_sekunden ?? 0}s)`,
        status: c.status,
        dauer: c.dauer_sekunden ?? undefined,
        hatTranskript: !!c.transkript_text,
        hatRecording: !!c.recording_url,
        kiZusammenfassung: c.ki_zusammenfassung,
        bridgeTyp: c.bridge ? (c.bridge as Record<string, unknown>).typ as string : null,
      })
    }
  }

  // 2. Emails
  if (types.includes('email')) {
    const { data: emails } = await db.from('email_log')
      .select('id, empfaenger, subject, status, gesendet_am, richtung, body_text, empfaenger_array')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(filter?.limit ?? 50)

    for (const e of emails ?? []) {
      items.push({
        id: `email-${e.id}`, sourceType: 'email', sourceId: e.id,
        zeitpunkt: e.gesendet_am ?? '',
        richtung: (e.richtung as 'inbound' | 'outbound') ?? 'outbound',
        initiatorName: e.richtung === 'inbound' ? (e.empfaenger ?? '—') : 'Claimondo',
        empfaengerName: e.richtung === 'outbound' ? (e.empfaenger ?? '—') : 'Claimondo',
        preview: e.subject ?? e.body_text?.slice(0, 120) ?? '—',
        status: e.status,
      })
    }
  }

  // 3. Chat (System-Nachrichten)
  if (types.includes('chat')) {
    const { data: msgs } = await db.from('nachrichten')
      .select('id, sender_rolle, nachricht, created_at, kanal')
      .eq('fall_id', fallId)
      .eq('sender_rolle', 'system')
      .order('created_at', { ascending: false })
      .limit(20)

    for (const m of msgs ?? []) {
      items.push({
        id: `chat-${m.id}`, sourceType: 'system', sourceId: m.id,
        zeitpunkt: m.created_at,
        richtung: 'system',
        initiatorName: 'System',
        empfaengerName: '',
        preview: m.nachricht?.slice(0, 120) ?? '',
        status: 'sent',
      })
    }
  }

  // Sortieren (neueste zuerst)
  items.sort((a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime())

  // Richtungs-Filter
  if (filter?.richtung) {
    return items.filter(i => i.richtung === filter.richtung)
  }

  return items.slice(0, filter?.limit ?? 50)
}
