// src/lib/task-executor/apply.ts
import { logFallEvent } from '@/lib/fall/log-event'
import { updateTaskStatusCore } from '@/lib/tasks/update-status-core'
import { sendFallCommunication } from '@/lib/communications/send-fall'
import { transitionFallStatus } from '@/lib/faelle/state-machine'
import type { ActionDraft, ExecCtx, ActionResult } from './types'

function errMsg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export async function applyInterneNotiz(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const text = String(draft.args.text ?? '').trim()
  if (!text) return { ok: false, error: 'Leerer Notiz-Text' }
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Timeline-Notiz' }
  try {
    await logFallEvent(ctx.db as never, {
      fallId: ctx.fallId,
      typ: 'system',
      titel: 'KI-Notiz',
      beschreibung: text,
      actor: ctx.userId,
      metadata: { quelle: 'task_executor', task_id: ctx.task.id },
    })
    return { ok: true, detail: 'Notiz gespeichert' }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Notiz fehlgeschlagen') }
  }
}

export async function applyTaskSchliessen(_draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  try {
    await updateTaskStatusCore(ctx.db, ctx.task.id, 'erledigt')
    return { ok: true, detail: 'Task erledigt' }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Task-Schliessen fehlgeschlagen') }
  }
}

export async function applySendeKommunikation(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const trigger = String(draft.args.trigger ?? '')
  const variablen = (draft.args.variablen ?? {}) as Record<string, string>
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Kommunikation' }
  if (!trigger) return { ok: false, error: 'Kein Trigger' }
  try {
    const res = await sendFallCommunication(ctx.fallId, trigger, variablen)
    if (!res.sent) return { ok: false, error: `Nicht gesendet: ${res.reason ?? 'unbekannt'}` }
    return { ok: true, detail: `Kommunikation gesendet: ${trigger}` }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Send fehlgeschlagen') }
  }
}

export async function applySetzeStatus(draft: ActionDraft, ctx: ExecCtx): Promise<ActionResult> {
  const neuerStatus = String(draft.args.neuer_status ?? '')
  const grund = String(draft.args.grund ?? '')
  if (!ctx.fallId) return { ok: false, error: 'Kein fall_id fuer Statuswechsel' }
  if (!neuerStatus) return { ok: false, error: 'Kein Zielstatus' }
  try {
    await transitionFallStatus(ctx.fallId, neuerStatus, { grund, user_id: ctx.userId })
    return { ok: true, detail: `Status → ${neuerStatus}` }
  } catch (err) {
    return { ok: false, error: errMsg(err, 'Statuswechsel fehlgeschlagen') }
  }
}
