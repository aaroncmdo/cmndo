// TDD-Tests fuer webhook-inbound-silent Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task4
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stub.
//
// Der Check liest webhook_events:
//   .select('created_at').order('created_at',{ascending:false}).limit(1)
//   -> 0 oder 1 Zeile; JS berechnet:
//      tageSeitLetztem = rows.length ? (now - rows[0].created_at) / 86400000 : null
// Schwellen:
//   null (nie)  -> crit
//   > 30 Tage   -> crit
//   > 7 Tage    -> warn
//   sonst       -> ok

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { webhookInboundSilentCheck } from '../webhook-inbound-silent'

// ---------------------------------------------------------------------------
// Hilfsfunktion: erzeugt einen ISO-String, der `ageTage` Tage in der Vergangenheit liegt.
// ---------------------------------------------------------------------------
function daysAgoIso(ageTage: number): string {
  return new Date(Date.now() - ageTage * 86_400_000).toISOString()
}

// ---------------------------------------------------------------------------
// Stub-Factory: liefert CheckCtx, deren supabase.from('webhook_events')
// entweder 0 Zeilen (keinEintrag=true) oder 1 Zeile mit dem angegebenen Alter zurueckgibt.
// ---------------------------------------------------------------------------
function makeCtx(tageSeitLetztem: number | null): CheckCtx {
  const rows: { created_at: string }[] =
    tageSeitLetztem === null ? [] : [{ created_at: daysAgoIso(tageSeitLetztem) }]

  const supabase = {
    from(table: string) {
      if (table !== 'webhook_events') {
        throw new Error(`unerwartete Tabelle: ${table}`)
      }
      // Simuliert: .select('created_at').order(...).limit(1) -> 0 oder 1 Zeile
      return {
        select: (_cols: string) => ({
          order: (_col: string, _opts: unknown) => ({
            limit: (_n: number) =>
              Promise.resolve({ data: rows, error: null }),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

function makeErrCtx(errorMessage: string): CheckCtx {
  const supabase = {
    from(_table: string) {
      return {
        select: (_cols: string) => ({
          order: (_col: string, _opts: unknown) => ({
            limit: (_n: number) =>
              Promise.resolve({ data: null, error: { message: errorMessage } }),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('webhookInboundSilentCheck', () => {
  it('hat korrekte id und category', () => {
    expect(webhookInboundSilentCheck.id).toBe('webhook-inbound-silent')
    expect(webhookInboundSilentCheck.category).toBe('sends')
  })

  it('liefert crit wenn noch nie ein Webhook empfangen wurde (null)', async () => {
    const ctx = makeCtx(null)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.detail).toMatch(/nie|never|Noch nie/i)
  })

  it('liefert crit wenn letztes Webhook > 30 Tage her', async () => {
    const ctx = makeCtx(31)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('crit')
  })

  it('liefert crit bei genau 31 Tagen (> 30)', async () => {
    const ctx = makeCtx(31)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.detail).toContain('LexDrive')
  })

  it('liefert warn bei genau 30 Tagen (Grenzfall: nicht > 30 aber > 7)', async () => {
    const ctx = makeCtx(30)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('liefert warn wenn letztes Webhook > 7 Tage her', async () => {
    const ctx = makeCtx(14)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('LexDrive')
  })

  it('liefert warn bei genau 8 Tagen (> 7)', async () => {
    const ctx = makeCtx(8)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('liefert ok wenn letztes Webhook <= 7 Tage her', async () => {
    const ctx = makeCtx(3)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert ok bei genau 7 Tagen (Grenzfall: nicht > 7)', async () => {
    const ctx = makeCtx(7)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('liefert ok bei 0 Tagen (sehr aktuell)', async () => {
    const ctx = makeCtx(0)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('ok')
  })

  it('detail enthaelt Tage-Angabe wenn Webhook-Eintrag vorhanden', async () => {
    const ctx = makeCtx(14)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.detail).toMatch(/14|Tage/i)
  })

  it('liefert metric mit Tage-Wert bei vorhandenem Eintrag', async () => {
    const ctx = makeCtx(10)
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(typeof result.metric).toBe('number')
  })

  it('liefert error bei DB-Fehler', async () => {
    const ctx = makeErrCtx('connection refused')
    const result = await webhookInboundSilentCheck.run(ctx)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('connection refused')
  })
})
