import { createAdminClient } from '@/lib/supabase/admin'

export type TimelineItem = {
  id: string
  sourceType: 'call' | 'email' | 'whatsapp' | 'chat' | 'system'
  sourceId: string
  zeitpunkt: string
  richtung: 'inbound' | 'outbound' | 'bridge' | 'system'
  initiatorName: string
  empfaengerName: string
  preview: string
  status: string
  // Call-spezifisch
  dauer?: number
  hatTranskript?: boolean
  hatRecording?: boolean
  kiZusammenfassung?: string | null
  kiNaechsteSchritte?: string | null
  bridgeTyp?: string | null
  sentiment?: string | null
  // Email-spezifisch
  emailSubject?: string | null
  emailBodyHtml?: string | null
  emailAttachments?: unknown[] | null
  emailRichtung?: string | null
  // Aus Lead-Phase
  ausLeadPhase?: boolean
}

export type TimelineFilter = {
  types?: ('call' | 'email' | 'whatsapp' | 'chat' | 'system')[]
  richtung?: 'inbound' | 'outbound'
  search?: string
  limit?: number
  offset?: number
}

/**
 * KFZ-147 B.2: Unified Communication Timeline für einen Fall.
 * Merged Calls + Emails + Chat chronologisch, paginated.
 */
export async function getCommunicationTimeline(
  fallId: string,
  filter?: TimelineFilter,
): Promise<{ items: TimelineItem[]; hasMore: boolean }> {
  const db = createAdminClient()
  const items: TimelineItem[] = []
  const types = filter?.types ?? ['call', 'email', 'chat', 'system']
  const perSource = (filter?.limit ?? 50) + 10 // Etwas mehr laden für post-merge Limit

  // Fall-Erstellungsdatum für "Aus Lead-Phase" Badge
  const { data: fall } = await db.from('faelle').select('created_at, lead_id').eq('id', fallId).single()
  const fallCreated = fall?.created_at ? new Date(fall.created_at) : null

  // ─── 1. Calls ───────────────────────────────────────────────────────────
  if (types.includes('call')) {
    let q = db.from('calls')
      .select('id, richtung, status, von_nummer, zu_nummer, gestartet_am, beendet_am, dauer_sekunden, ki_zusammenfassung, ki_naechste_schritte, transkript_text, recording_url, bridge, sentiment, lead_id, notiz')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(perSource)
    if (filter?.offset) q = q.range(filter.offset, filter.offset + perSource - 1)

    const { data: calls } = await q

    for (const c of calls ?? []) {
      const isLeadPhase = !!(fallCreated && c.lead_id && new Date(c.gestartet_am ?? c.beendet_am ?? '').getTime() < fallCreated.getTime())
      items.push({
        id: `call-${c.id}`, sourceType: 'call', sourceId: c.id,
        zeitpunkt: c.gestartet_am ?? c.beendet_am ?? '',
        richtung: c.richtung === 'bridge' ? 'bridge' : c.richtung === 'inbound' ? 'inbound' : 'outbound',
        initiatorName: c.von_nummer ?? '—',
        empfaengerName: c.zu_nummer ?? '—',
        preview: c.ki_zusammenfassung?.slice(0, 150) ?? c.notiz?.slice(0, 150) ?? `Anruf (${Math.floor((c.dauer_sekunden ?? 0) / 60)}:${String((c.dauer_sekunden ?? 0) % 60).padStart(2, '0')})`,
        status: c.status,
        dauer: c.dauer_sekunden ?? undefined,
        hatTranskript: !!c.transkript_text,
        hatRecording: !!c.recording_url,
        kiZusammenfassung: c.ki_zusammenfassung,
        kiNaechsteSchritte: c.ki_naechste_schritte,
        bridgeTyp: c.bridge ? (c.bridge as Record<string, unknown>).typ as string : null,
        sentiment: c.sentiment,
        ausLeadPhase: isLeadPhase,
      })
    }
  }

  // ─── 2. Emails ──────────────────────────────────────────────────────────
  if (types.includes('email')) {
    let q = db.from('email_log')
      .select('id, empfaenger, subject, status, gesendet_am, richtung, body_html, body_text, empfaenger_array, attachments, template, lead_id, created_at')
      .eq('fall_id', fallId)
      .order('created_at', { ascending: false })
      .limit(perSource)
    if (filter?.offset) q = q.range(filter.offset, filter.offset + perSource - 1)

    const { data: emails } = await q

    for (const e of emails ?? []) {
      const isLeadPhase = !!(fallCreated && e.lead_id && new Date(e.created_at).getTime() < fallCreated.getTime())
      items.push({
        id: `email-${e.id}`, sourceType: 'email', sourceId: e.id,
        zeitpunkt: e.gesendet_am ?? e.created_at ?? '',
        richtung: (e.richtung as 'inbound' | 'outbound') ?? 'outbound',
        initiatorName: e.richtung === 'inbound' ? (e.empfaenger ?? '—') : 'Claimondo',
        empfaengerName: e.richtung === 'outbound' ? (e.empfaenger ?? '—') : 'Claimondo',
        preview: e.subject ?? e.body_text?.slice(0, 150) ?? '—',
        status: e.status,
        emailSubject: e.subject,
        emailBodyHtml: e.body_html,
        emailAttachments: e.attachments as unknown[] | null,
        emailRichtung: e.richtung,
        ausLeadPhase: isLeadPhase,
      })
    }
  }

  // ─── 3. Chat (System-Nachrichten) ───────────────────────────────────────
  if (types.includes('system') || types.includes('chat')) {
    const { data: msgs } = await db.from('nachrichten')
      .select('id, sender_rolle, nachricht, created_at, kanal')
      .eq('fall_id', fallId)
      .in('sender_rolle', ['system'])
      .order('created_at', { ascending: false })
      .limit(30)

    for (const m of msgs ?? []) {
      items.push({
        id: `sys-${m.id}`, sourceType: 'system', sourceId: m.id,
        zeitpunkt: m.created_at,
        richtung: 'system',
        initiatorName: 'System',
        empfaengerName: '',
        preview: m.nachricht?.slice(0, 150) ?? '',
        status: 'sent',
      })
    }
  }

  // ─── Sortieren + Filter + Limit ─────────────────────────────────────────
  items.sort((a, b) => new Date(b.zeitpunkt).getTime() - new Date(a.zeitpunkt).getTime())

  let filtered = items
  if (filter?.richtung) {
    filtered = filtered.filter(i => i.richtung === filter.richtung)
  }
  if (filter?.search) {
    const s = filter.search.toLowerCase()
    filtered = filtered.filter(i =>
      i.preview.toLowerCase().includes(s) ||
      i.initiatorName.toLowerCase().includes(s) ||
      i.empfaengerName.toLowerCase().includes(s) ||
      (i.emailSubject ?? '').toLowerCase().includes(s)
    )
  }

  const limit = filter?.limit ?? 50
  const hasMore = filtered.length > limit
  return { items: filtered.slice(0, limit), hasMore }
}

/**
 * KFZ-147 B.3: Transkript für einen Call laden (lazy, speaker-getrennt).
 */
export async function getCallTranscriptDetail(callId: string): Promise<{
  utterances: Array<{ speaker: string | null; text: string; startTime: number | null }>
  recordingUrl: string | null
  kiZusammenfassung: string | null
  kiNaechsteSchritte: string | null
  copilotSuggestions: Array<{ vorschlag: string; kategorie: string; ausloeser: string }>
}> {
  const db = createAdminClient()

  const { data: call } = await db.from('calls')
    .select('recording_url, ki_zusammenfassung, ki_naechste_schritte, transkript')
    .eq('id', callId)
    .single()

  // Utterances aus der Live-Tabelle
  const { data: utterances } = await db.from('call_transcription_utterances')
    .select('speaker, text, start_time')
    .eq('call_id', callId)
    .order('start_time', { ascending: true })

  // Co-Pilot Suggestions
  const { data: suggestions } = await db.from('call_copilot_suggestions')
    .select('vorschlag, kategorie, ausloeser')
    .eq('call_id', callId)
    .order('created_at', { ascending: true })

  // Falls keine Utterances in der Live-Tabelle, Fallback auf calls.transkript JSONB
  let allUtterances = (utterances ?? []).map(u => ({
    speaker: u.speaker,
    text: u.text,
    startTime: u.start_time ? Number(u.start_time) : null,
  }))

  if (allUtterances.length === 0 && call?.transkript) {
    const t = call.transkript as { segments?: Array<{ speaker?: string; text?: string; start?: number }> }
    if (t.segments) {
      allUtterances = t.segments.map(s => ({
        speaker: s.speaker ?? null,
        text: s.text ?? '',
        startTime: s.start ?? null,
      }))
    }
  }

  return {
    utterances: allUtterances,
    recordingUrl: call?.recording_url ?? null,
    kiZusammenfassung: call?.ki_zusammenfassung ?? null,
    kiNaechsteSchritte: call?.ki_naechste_schritte ?? null,
    copilotSuggestions: (suggestions ?? []).map(s => ({
      vorschlag: s.vorschlag,
      kategorie: s.kategorie,
      ausloeser: s.ausloeser,
    })),
  }
}
