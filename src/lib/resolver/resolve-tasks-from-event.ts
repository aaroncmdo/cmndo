// AAR-764: Resolver — nach `emitEvent()` aufgerufen. Schaut in der Event→Task-
// Map nach, löst Template-Variablen auf und legt pro Spec einen Task inkl.
// Reminder-Kaskade an. Non-blocking: Fehler werden geloggt, aber der Aufrufer
// (emit.ts) wirft nicht.

import { createAdminClient } from '@/lib/supabase/admin'
import { createLinkedTask } from '@/lib/tasks/create-task'
import type { EventType } from '@/lib/notifications/types'
import { EVENT_TO_TASK, type TaskSpec } from './event-to-task-map'

type EventPayloadBag = Record<string, unknown>

type ResolvedTaskContext = {
  claim_nummer: string
  vorname: string
  nachname: string
  kunde_name: string
  sv_name: string
  kb_name: string
  dokument_typ: string
  betrag: string
  frist: string
  tage_rest: string
}

function str(v: unknown, fallback = ''): string {
  if (v === null || v === undefined) return fallback
  return String(v)
}

/**
 * Baut den Variablen-Kontext für Template-Expand. Payload hat Vorrang,
 * fehlende Pflicht-Keys werden aus dem Fall geladen.
 */
async function buildContext(
  payload: EventPayloadBag,
  fallId: string | null,
): Promise<ResolvedTaskContext> {
  const ctx: ResolvedTaskContext = {
    claim_nummer: str(payload.claim_nummer) || (fallId ? fallId.slice(0, 8) : '—'),
    vorname: str(payload.vorname),
    nachname: str(payload.nachname),
    kunde_name: str(payload.kunde_name) || str(payload.kundenName),
    sv_name: str(payload.sv_name),
    kb_name: str(payload.kb_name),
    dokument_typ: str(payload.dokument_typ) || str(payload.dokumentTyp),
    betrag: str(payload.betrag),
    frist: str(payload.frist),
    tage_rest: str(payload.tage_rest),
  }

  if (fallId && (!ctx.claim_nummer || ctx.claim_nummer === fallId.slice(0, 8) || !ctx.kunde_name)) {
    const supabase = createAdminClient()
    const { data: fall } = await supabase
      .from('faelle')
      .select('lead_id, claims:claim_id(claim_nummer)')
      .eq('id', fallId)
      .maybeSingle()
    const fallClaimNummer =
      (Array.isArray(fall?.claims) ? fall?.claims[0] : fall?.claims)?.claim_nummer ?? null
    if (fallClaimNummer) ctx.claim_nummer = fallClaimNummer

    if (fall?.lead_id && !ctx.kunde_name) {
      const { data: lead } = await supabase
        .from('leads')
        .select('vorname, nachname')
        .eq('id', fall.lead_id)
        .maybeSingle()
      if (lead) {
        ctx.vorname = ctx.vorname || str(lead.vorname)
        ctx.nachname = ctx.nachname || str(lead.nachname)
        ctx.kunde_name = ctx.kunde_name || [lead.vorname, lead.nachname].filter(Boolean).join(' ') || '—'
      }
    }
  }

  return ctx
}

/**
 * Ersetzt {varname}-Placeholder im Template mit dem Kontext.
 * Unbekannte Vars bleiben als Literal — besser sichtbar im Task als still zu
 * droppen.
 */
function expandTemplate(template: string, ctx: ResolvedTaskContext): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    const v = (ctx as Record<string, string>)[key]
    return v !== undefined ? v : match
  })
}

/**
 * Haupt-Einstieg. Wird aus `emitEvent()` fire-and-forget aufgerufen.
 */
export async function resolveTasksFromEvent(
  eventType: EventType,
  payload: EventPayloadBag,
  opts: { fallId?: string | null; triggeredBy?: string | null; eventId?: string },
): Promise<{ created: number; task_ids: string[] }> {
  const specs = EVENT_TO_TASK[eventType]
  if (!specs || specs.length === 0) return { created: 0, task_ids: [] }

  const fallId = opts.fallId ?? (typeof payload.fallId === 'string' ? payload.fallId : null)
  if (!fallId) {
    // Tasks in diesem Resolver sind immer Fall-bezogen. Events ohne fallId
    // (z.B. makler.lead_eingegangen) werden hier übersprungen.
    return { created: 0, task_ids: [] }
  }

  const ctx = await buildContext(payload, fallId)
  const createdIds: string[] = []

  for (const spec of specs) {
    try {
      const titel = expandTemplate(spec.titel_template, ctx)
      const beschreibung = spec.beschreibung_template
        ? expandTemplate(spec.beschreibung_template, ctx)
        : undefined

      const faelligAm = new Date(Date.now() + spec.deadline_hours * 3600 * 1000)

      const { task_id } = await createLinkedTask({
        titel,
        beschreibung,
        prioritaet: spec.prioritaet ?? 'normal',
        empfaenger_rolle: spec.empfaenger_rolle,
        typ: spec.task_typ,
        fall_id: fallId,
        faellig_am: faelligAm,
        trigger_event: eventType,
        auto_erstellt: true,
      })

      if (task_id) {
        createdIds.push(task_id)

        // Reminder-Kaskade wird bereits von `createLinkedTask` →
        // `generateReminderForTask` basierend auf Deadline angelegt. Falls
        // der Spec eigene Reminder-Steps hat, müssen wir sie zusätzlich
        // registrieren. Das verzahnen wir in einem Follow-up wenn
        // auf die bestehende reminder-config-Struktur abgeklopft wurde.
      }
    } catch (err) {
      console.error(
        `[AAR-764 resolver] Task-Erstellung fehlgeschlagen für ${eventType}:`,
        err instanceof Error ? err.message : err,
      )
    }
  }

  return { created: createdIds.length, task_ids: createdIds }
}
