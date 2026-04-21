// AAR-544 (C7): Unified Event-Stream für die Admin-Fallakte Timeline.
// Lädt parallel alle 7 Event-Quellen zum Fall (timeline, system-nachrichten,
// mitteilungen, webhook_events, auto-resolved tasks, pflichtdokumente,
// gutachter_termine), normalisiert sie zu FallEvent[] und sortiert
// chronologisch (neueste zuerst). Wird vom TimelineTab gerendert.
//
// Dedup-Regel: Timeline-Einträge mit metadata.webhook_event_id werden
// unterdrückt, wenn der entsprechende webhook_event-Eintrag ebenfalls im
// Stream liegt — webhook_events ist die Source-of-Truth.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type FallEventSource =
  | 'timeline'
  | 'nachricht_system'
  | 'mitteilung'
  | 'webhook'
  | 'task'
  | 'dokument'
  | 'termin'

export type FallEventSeverity = 'info' | 'success' | 'warning' | 'error'

export interface FallEventActor {
  id?: string
  name?: string
  rolle?: string
}

export interface FallEvent {
  id: string
  timestamp: string
  source: FallEventSource
  kategorie: string
  typ: string
  titel: string
  beschreibung?: string
  metadata?: Record<string, unknown>
  actor?: FallEventActor
  severity: FallEventSeverity
  icon?: string
  route_url?: string
}

export interface EventStreamFilter {
  sources?: FallEventSource[]
  after?: string
  before?: string
  search?: string
}

type Client = SupabaseClient<Database>

// ──────────────────────────────────────────────────────────────────────────
// Normalisierer pro Quelle
// ──────────────────────────────────────────────────────────────────────────

type TimelineRow = Database['public']['Tables']['timeline']['Row']
type NachrichtRow = Database['public']['Tables']['nachrichten']['Row']
type MitteilungRow = Database['public']['Tables']['mitteilungen']['Row']
type WebhookEventRow = Database['public']['Tables']['webhook_events']['Row']
type TaskRow = Database['public']['Tables']['tasks']['Row']
type PflichtRow = Database['public']['Tables']['pflichtdokumente']['Row']
type TerminRow = Database['public']['Tables']['gutachter_termine']['Row']
type ProfileRow = { id: string; vorname: string | null; nachname: string | null; rolle: string | null }

function timelineSeverity(typ: string): FallEventSeverity {
  if (typ === 'eskalation' || typ === 'fehler') return 'error'
  if (typ === 'warnung') return 'warning'
  if (typ === 'status' || typ === 'status_wechsel' || typ === 'erfolg') return 'success'
  return 'info'
}

function timelineIcon(typ: string): string {
  if (typ === 'eskalation') return 'alert-triangle'
  if (typ === 'status' || typ === 'status_wechsel') return 'arrow-right'
  if (typ === 'dokument') return 'file-text'
  if (typ === 'termin') return 'calendar'
  if (typ === 'kommunikation') return 'message-square'
  return 'clock'
}

function normalizeTimeline(
  rows: TimelineRow[],
  actors: Map<string, ProfileRow>,
): FallEvent[] {
  return rows.map((r) => {
    const actor = r.erstellt_von ? actors.get(r.erstellt_von) : null
    return {
      id: `timeline:${r.id}`,
      timestamp: r.created_at ?? '',
      source: 'timeline',
      kategorie: r.typ ?? 'sonstiges',
      typ: r.typ ?? 'notiz',
      titel: r.titel,
      beschreibung: r.beschreibung ?? undefined,
      metadata: (r.metadata as Record<string, unknown> | null) ?? undefined,
      actor: actor
        ? {
            id: actor.id,
            name: [actor.vorname, actor.nachname].filter(Boolean).join(' ') || undefined,
            rolle: actor.rolle ?? undefined,
          }
        : undefined,
      severity: timelineSeverity(r.typ ?? ''),
      icon: timelineIcon(r.typ ?? ''),
    }
  })
}

function normalizeSystemNachrichten(
  rows: NachrichtRow[],
  fallId: string,
): FallEvent[] {
  return rows.map((r) => ({
    id: `nachricht_system:${r.id}`,
    timestamp: r.created_at ?? '',
    source: 'nachricht_system',
    kategorie: 'kommunikation',
    typ: r.system_event ?? 'system_nachricht',
    titel: r.nachricht.length > 120 ? `${r.nachricht.slice(0, 117)}…` : r.nachricht,
    beschreibung: r.nachricht.length > 120 ? r.nachricht : undefined,
    metadata: {
      kanal: r.kanal,
      system_event: r.system_event,
      sender_rolle: r.sender_rolle,
    },
    severity: 'info',
    icon: 'message-square',
    route_url: `/faelle/${fallId}?tab=kommunikation`,
  }))
}

function normalizeMitteilungen(rows: MitteilungRow[]): FallEvent[] {
  return rows.map((r) => ({
    id: `mitteilung:${r.id}`,
    timestamp: r.created_at ?? '',
    source: 'mitteilung',
    kategorie: r.kategorie ?? 'mitteilung',
    typ: r.kategorie ?? 'mitteilung',
    titel: r.titel,
    beschreibung: r.inhalt ?? undefined,
    metadata: {
      empfaenger_rolle: r.empfaenger_rolle,
      prioritaet: r.prioritaet,
      icon: r.icon,
      absender_name: r.absender_name,
    },
    actor: r.absender_name
      ? { id: r.absender_id ?? undefined, name: r.absender_name }
      : undefined,
    severity: r.prioritaet === 'hoch' ? 'warning' : 'info',
    icon: r.icon ?? 'bell',
    route_url: r.route_url ?? undefined,
  }))
}

function webhookSeverity(eventType: string, status: string | null): FallEventSeverity {
  if (status === 'error' || status === 'failed') return 'error'
  if (eventType.includes('fehler') || eventType.includes('error')) return 'error'
  if (eventType.includes('breach') || eventType.includes('ruege')) return 'warning'
  return 'success'
}

function normalizeWebhooks(rows: WebhookEventRow[]): FallEvent[] {
  return rows.map((r) => ({
    id: `webhook:${r.id}`,
    timestamp: r.processed_at ?? r.created_at ?? '',
    source: 'webhook',
    kategorie: 'integration',
    typ: r.event_type,
    titel: `Webhook: ${r.event_type}`,
    beschreibung: r.error_message ?? undefined,
    metadata: {
      source: r.source,
      status: r.status,
      payload: r.payload,
      event_id: r.event_id,
    },
    actor: r.source
      ? { rolle: r.source }
      : undefined,
    severity: webhookSeverity(r.event_type, r.status),
    icon: 'zap',
  }))
}

function normalizeResolvedTasks(
  rows: TaskRow[],
  actors: Map<string, ProfileRow>,
): FallEvent[] {
  return rows
    .filter((r) => r.auto_resolved_am)
    .map((r) => {
      const actor = r.erstellt_von_id ? actors.get(r.erstellt_von_id) : null
      return {
        id: `task:${r.id}`,
        timestamp: r.auto_resolved_am ?? '',
        source: 'task' as FallEventSource,
        kategorie: 'task',
        typ: r.task_code ?? r.typ ?? 'task_resolved',
        titel: `Task auto-erledigt: ${r.titel}`,
        beschreibung: r.auto_resolved_grund ?? r.beschreibung ?? undefined,
        metadata: {
          task_code: r.task_code,
          empfaenger_rolle: r.empfaenger_rolle,
          auto_resolved_grund: r.auto_resolved_grund,
          prioritaet: r.prioritaet,
        },
        actor: actor
          ? {
              id: actor.id,
              name: [actor.vorname, actor.nachname].filter(Boolean).join(' ') || undefined,
              rolle: actor.rolle ?? undefined,
            }
          : undefined,
        severity: 'success' as FallEventSeverity,
        icon: 'check-circle',
      }
    })
}

type DokumentEvent = { at: string; phase: 'angefordert' | 'hochgeladen' }

function normalizeDokumente(
  rows: PflichtRow[],
  actors: Map<string, ProfileRow>,
): FallEvent[] {
  const events: FallEvent[] = []
  for (const r of rows) {
    const doks: DokumentEvent[] = []
    if (r.angefordert_am) doks.push({ at: r.angefordert_am, phase: 'angefordert' })
    if (r.hochgeladen_am) doks.push({ at: r.hochgeladen_am, phase: 'hochgeladen' })
    for (const d of doks) {
      const actor =
        d.phase === 'angefordert' && r.angefordert_von_user_id
          ? actors.get(r.angefordert_von_user_id)
          : null
      events.push({
        id: `dokument:${r.id}:${d.phase}`,
        timestamp: d.at,
        source: 'dokument',
        kategorie: 'dokument',
        typ: `dokument_${d.phase}`,
        titel:
          d.phase === 'angefordert'
            ? `Dokument angefordert: ${r.dokument_typ}`
            : `Dokument hochgeladen: ${r.dokument_typ}`,
        beschreibung: r.begruendung ?? undefined,
        metadata: {
          dokument_typ: r.dokument_typ,
          status: r.status,
          pflicht: r.pflicht,
          quelle: r.quelle,
          frist: r.frist,
          angefordert_von_rolle: r.angefordert_von_rolle,
        },
        actor: actor
          ? {
              id: actor.id,
              name: [actor.vorname, actor.nachname].filter(Boolean).join(' ') || undefined,
              rolle: actor.rolle ?? undefined,
            }
          : undefined,
        severity: d.phase === 'hochgeladen' ? 'success' : 'info',
        icon: 'file-text',
      })
    }
  }
  return events
}

type TerminEvent = { at: string; phase: string; titel: string }

function normalizeTermine(rows: TerminRow[]): FallEvent[] {
  const events: FallEvent[] = []
  for (const r of rows) {
    const terminLabel = r.typ ? `${r.typ}-Termin` : 'Termin'
    const ev: TerminEvent[] = []
    if (r.created_at) ev.push({ at: r.created_at, phase: 'geplant', titel: `${terminLabel} geplant` })
    if (r.cancelled_at) ev.push({ at: r.cancelled_at, phase: 'storniert', titel: `${terminLabel} storniert` })
    if (r.sv_unterwegs_seit)
      ev.push({ at: r.sv_unterwegs_seit, phase: 'sv_unterwegs', titel: `${terminLabel}: SV losgefahren` })
    if (r.sv_angekommen_am)
      ev.push({ at: r.sv_angekommen_am, phase: 'sv_angekommen', titel: `${terminLabel}: SV angekommen` })
    if (r.durchgefuehrt_am)
      ev.push({ at: r.durchgefuehrt_am, phase: 'durchgefuehrt', titel: `${terminLabel} durchgeführt` })
    for (const e of ev) {
      events.push({
        id: `termin:${r.id}:${e.phase}`,
        timestamp: e.at,
        source: 'termin',
        kategorie: 'termin',
        typ: `termin_${e.phase}`,
        titel: e.titel,
        metadata: {
          termin_id: r.id,
          termin_typ: r.typ,
          start_zeit: r.start_zeit,
          status: r.status,
        },
        severity:
          e.phase === 'storniert'
            ? 'warning'
            : e.phase === 'durchgefuehrt' || e.phase === 'sv_angekommen'
              ? 'success'
              : 'info',
        icon: 'calendar',
      })
    }
  }
  return events
}

// ──────────────────────────────────────────────────────────────────────────
// Dedup
// ──────────────────────────────────────────────────────────────────────────

function dedupEvents(events: FallEvent[]): FallEvent[] {
  // Timeline-Einträge mit metadata.webhook_event_id unterdrücken, wenn der
  // passende Webhook ebenfalls im Stream liegt.
  const webhookEventIds = new Set<string>()
  for (const e of events) {
    if (e.source === 'webhook') {
      const id = (e.metadata?.event_id as string | undefined) ?? e.id.replace('webhook:', '')
      webhookEventIds.add(id)
    }
  }
  return events.filter((e) => {
    if (e.source !== 'timeline') return true
    const webhookId = e.metadata?.webhook_event_id as string | undefined
    if (!webhookId) return true
    return !webhookEventIds.has(webhookId)
  })
}

// ──────────────────────────────────────────────────────────────────────────
// Main Loader
// ──────────────────────────────────────────────────────────────────────────

export async function getFallEventStream(
  supabase: Client,
  fall_id: string,
  filter?: EventStreamFilter,
): Promise<FallEvent[]> {
  const [timeline, sysNachrichten, mitteilungen, webhooks, tasks, dokumente, termine] =
    await Promise.all([
      supabase
        .from('timeline')
        .select('*')
        .eq('fall_id', fall_id)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('nachrichten')
        .select('*')
        .eq('fall_id', fall_id)
        .eq('is_system', true)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('mitteilungen')
        .select('*')
        .eq('kontext_typ', 'fall')
        .eq('kontext_id', fall_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('webhook_events')
        .select('*')
        .eq('fall_id', fall_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('tasks')
        .select('*')
        .eq('fall_id', fall_id)
        .not('auto_resolved_am', 'is', null)
        .order('auto_resolved_am', { ascending: false })
        .limit(200),
      supabase
        .from('pflichtdokumente')
        .select('*')
        .eq('fall_id', fall_id)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('gutachter_termine')
        .select('*')
        .eq('fall_id', fall_id)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

  // Actors: alle user_ids sammeln und in einer Query auflösen
  const userIds = new Set<string>()
  for (const r of timeline.data ?? []) if (r.erstellt_von) userIds.add(r.erstellt_von)
  for (const r of tasks.data ?? []) if (r.erstellt_von_id) userIds.add(r.erstellt_von_id)
  for (const r of dokumente.data ?? [])
    if (r.angefordert_von_user_id) userIds.add(r.angefordert_von_user_id)

  const actors = new Map<string, ProfileRow>()
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, vorname, nachname, rolle')
      .in('id', Array.from(userIds))
    for (const p of (profiles ?? []) as ProfileRow[]) actors.set(p.id, p)
  }

  const events: FallEvent[] = [
    ...normalizeTimeline(timeline.data ?? [], actors),
    ...normalizeSystemNachrichten(sysNachrichten.data ?? [], fall_id),
    ...normalizeMitteilungen(mitteilungen.data ?? []),
    ...normalizeWebhooks(webhooks.data ?? []),
    ...normalizeResolvedTasks(tasks.data ?? [], actors),
    ...normalizeDokumente(dokumente.data ?? [], actors),
    ...normalizeTermine(termine.data ?? []),
  ]

  const deduped = dedupEvents(events)
  deduped.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

  let filtered = deduped
  if (filter?.sources?.length) {
    const allowed = new Set(filter.sources)
    filtered = filtered.filter((e) => allowed.has(e.source))
  }
  if (filter?.after) {
    const after = filter.after
    filtered = filtered.filter((e) => e.timestamp >= after)
  }
  if (filter?.before) {
    const before = filter.before
    filtered = filtered.filter((e) => e.timestamp <= before)
  }
  if (filter?.search) {
    const s = filter.search.toLowerCase()
    filtered = filtered.filter(
      (e) =>
        e.titel.toLowerCase().includes(s) ||
        (e.beschreibung ?? '').toLowerCase().includes(s) ||
        e.typ.toLowerCase().includes(s) ||
        (e.actor?.name ?? '').toLowerCase().includes(s),
    )
  }
  return filtered
}
