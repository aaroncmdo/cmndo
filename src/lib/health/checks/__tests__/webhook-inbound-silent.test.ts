// TDD-Tests fuer webhook-inbound-silent Health-Check (generalisiert, Multi-Channel).
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task4
// + 03.07.2026 Vercel-Cleanup-Follow-up: nach dem VPS-Umzug koennen partner-seitige
//   Webhook-URLs auf der toten cmndo.vercel.app-Domain haengen -> ein toter Kanal
//   soll automatisch auffallen. Monitort jetzt LexDrive + Matelso + Aircall.
//
// Kernlogik `evaluateWebhookSilence` ist rein (kein DB) und wird direkt getestet;
// run() fetcht pro Kanal die letzte created_at aus der jeweiligen Landing-Tabelle.

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import {
  webhookInboundSilentCheck,
  evaluateWebhookSilence,
  type ChannelSilence,
} from '../webhook-inbound-silent'

function daysAgoIso(ageTage: number): string {
  return new Date(Date.now() - ageTage * 86_400_000).toISOString()
}

const ch = (label: string, tage: number | null, warnTage = 7, critTage = 30): ChannelSilence => ({
  id: label.toLowerCase(),
  label,
  tage,
  warnTage,
  critTage,
})

// ── Reine Kernlogik ────────────────────────────────────────────────────────
describe('evaluateWebhookSilence (rein)', () => {
  it('ok wenn alle Kanaele frisch sind', () => {
    const r = evaluateWebhookSilence([ch('LexDrive', 2), ch('Matelso', 1, 14, 45), ch('Aircall', 0, 14, 45)])
    expect(r.status).toBe('ok')
  })

  it('crit dominiert: ein Kanal ueber critTage => overall crit', () => {
    const r = evaluateWebhookSilence([ch('LexDrive', 31), ch('Matelso', 1, 14, 45)])
    expect(r.status).toBe('crit')
    expect(r.detail).toContain('LexDrive')
  })

  it('warn wenn ein Kanal zwischen warn und crit liegt (kein crit)', () => {
    const r = evaluateWebhookSilence([ch('LexDrive', 14), ch('Matelso', 1, 14, 45)])
    expect(r.status).toBe('warn')
  })

  it('nie empfangen (null) => warn (prüfen ob konfiguriert), nicht crit', () => {
    const r = evaluateWebhookSilence([ch('Aircall', null, 14, 45)])
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/nie/i)
  })

  it('Grenzen: genau critTage => warn, > critTage => crit', () => {
    expect(evaluateWebhookSilence([ch('X', 30)]).status).toBe('warn')
    expect(evaluateWebhookSilence([ch('X', 31)]).status).toBe('crit')
  })

  it('Grenzen: genau warnTage => ok, > warnTage => warn', () => {
    expect(evaluateWebhookSilence([ch('X', 7)]).status).toBe('ok')
    expect(evaluateWebhookSilence([ch('X', 8)]).status).toBe('warn')
  })

  it('detail listet ALLE Kanaele + metric = Anzahl nicht-ok', () => {
    const r = evaluateWebhookSilence([ch('LexDrive', 31), ch('Matelso', null, 14, 45), ch('Aircall', 0, 14, 45)])
    expect(r.detail).toContain('LexDrive')
    expect(r.detail).toContain('Matelso')
    expect(r.detail).toContain('Aircall')
    expect(r.metric).toBe(2) // LexDrive crit + Matelso nie
  })
})

// ── run() gegen Multi-Table-Stub ────────────────────────────────────────────
function makeCtx(perTable: Record<string, number | null>, errorMessage?: string): CheckCtx {
  const supabase = {
    from(table: string) {
      const build = (rows: unknown[]) => ({
        select: (_c: string) => ({
          order: (_col: string, _o: unknown) => ({
            limit: (_n: number) =>
              errorMessage
                ? Promise.resolve({ data: null, error: { message: errorMessage } })
                : Promise.resolve({ data: rows, error: null }),
          }),
        }),
      })
      const tage = perTable[table]
      return build(tage == null ? [] : [{ created_at: daysAgoIso(tage) }])
    },
  } as unknown as CheckCtx['supabase']
  return { supabase } as unknown as CheckCtx
}

describe('webhookInboundSilentCheck.run', () => {
  it('id/category korrekt', () => {
    expect(webhookInboundSilentCheck.id).toBe('webhook-inbound-silent')
    expect(webhookInboundSilentCheck.category).toBe('sends')
  })

  it('crit wenn LexDrive > 30 Tage still (auch wenn Rest frisch)', async () => {
    const r = await webhookInboundSilentCheck.run(makeCtx({ webhook_events: 31, matelso_calls: 1, aircall_calls: 1 }))
    expect(r.status).toBe('crit')
    expect(r.detail).toContain('LexDrive')
  })

  it('ok wenn alle Kanaele frisch', async () => {
    const r = await webhookInboundSilentCheck.run(makeCtx({ webhook_events: 2, matelso_calls: 3, aircall_calls: 1 }))
    expect(r.status).toBe('ok')
  })

  it('warn wenn ein Kanal nie empfangen hat', async () => {
    const r = await webhookInboundSilentCheck.run(makeCtx({ webhook_events: 2, matelso_calls: null, aircall_calls: 2 }))
    expect(r.status).toBe('warn')
  })

  it('error bei DB-Fehler', async () => {
    const r = await webhookInboundSilentCheck.run(makeCtx({}, 'connection refused'))
    expect(r.status).toBe('error')
    expect(r.detail).toContain('connection refused')
  })
})
