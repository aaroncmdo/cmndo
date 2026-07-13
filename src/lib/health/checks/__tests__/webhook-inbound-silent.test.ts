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
// Der Stub modelliert die Kette .select().eq?().order().limit() FAITHFUL: `eq` filtert
// wirklich, `order` sortiert wirklich. Nur so faellt es ueberhaupt auf, wenn der Check
// den source-Filter verliert (B7: sonst wuerden manual_admin-Zeilen wieder als Inbound
// zaehlen und ein toter Rueckkanal bliebe unentdeckt).
type StubRow = { created_at: string; source?: string }

/** Zahl = Tage seit dem letzten ECHTEN Inbound; Array = explizite Rows (Source-Mix). */
type TableSpec = number | null | StubRow[]

// Inbound-source je Landing-Tabelle — muss zu CHANNELS.inboundSource passen.
const INBOUND_SOURCE: Record<string, string> = { webhook_events: 'lexdrive' }

// Explizite Chain-Typisierung: ein selbstreferenzierendes Objekt-Literal (chain -> chain)
// waere sonst ein TS-Zirkelschluss ("implicitly has type any ... referenced in its own
// initializer") und wuerde tsc brechen.
type StubResult = Promise<{ data: StubRow[] | null; error: { message: string } | null }>
type StubChain = {
  select: (c: string) => StubChain
  eq: (col: string, val: string) => StubChain
  order: (col: string, o?: { ascending?: boolean }) => StubChain
  limit: (n: number) => StubResult
}

function makeCtx(perTable: Record<string, TableSpec>, errorMessage?: string): CheckCtx {
  const supabase = {
    from(table: string) {
      const spec = perTable[table]
      let rows: StubRow[]
      if (Array.isArray(spec)) rows = [...spec]
      else if (spec == null) rows = []
      else rows = [{ created_at: daysAgoIso(spec), source: INBOUND_SOURCE[table] }]

      const chain: StubChain = {
        select: () => chain,
        eq: (col, val) => {
          rows = rows.filter((r) => (r as unknown as Record<string, unknown>)[col] === val)
          return chain
        },
        order: (_col, o) => {
          rows = [...rows].sort((a, b) => {
            const av = new Date(a.created_at).getTime()
            const bv = new Date(b.created_at).getTime()
            return o?.ascending ? av - bv : bv - av
          })
          return chain
        },
        limit: (n) =>
          errorMessage
            ? Promise.resolve({ data: null, error: { message: errorMessage } })
            : Promise.resolve({ data: rows.slice(0, n), error: null }),
      }
      return chain
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

  // ── B7-Regressions-Pins: interne manual_admin-Zeilen sind KEIN Inbound ──────────
  // `webhook_events` wird auch von processLexDriveEvent(source='manual') beschrieben
  // (Admin-UI: manueller Status-Override / LexDrive-Trigger-Panel) -> source='manual_admin'
  // (process-event.ts:735). Ohne source-Filter setzt eine ganz normale Admin-Aktion die
  // Inbound-Uhr auf 0 und MASKIERT einen toten Rueckkanal — eine falsche Entwarnung in
  // genau dem Check, der den toten Kanal finden soll. Diese Pins halten den Filter fest.

  it('B7-PIN: frische manual_admin-Zeile maskiert NICHT den toten LexDrive-Inbound', async () => {
    const r = await webhookInboundSilentCheck.run(
      makeCtx({
        webhook_events: [
          { created_at: daysAgoIso(0), source: 'manual_admin' }, // Admin-Override HEUTE
          { created_at: daysAgoIso(40), source: 'lexdrive' }, // letztes ECHTES Inbound
        ],
        matelso_calls: 1,
        aircall_calls: 1,
      }),
    )
    expect(r.status).toBe('crit') // 40 > critTage(30) -> der tote Rueckkanal MUSS auffallen
    expect(r.detail).toContain('LexDrive')
  })

  it('B7-PIN: NUR manual_admin-Zeilen => LexDrive gilt als "nie empfangen" (warn), nicht ok', async () => {
    const r = await webhookInboundSilentCheck.run(
      makeCtx({
        webhook_events: [{ created_at: daysAgoIso(0), source: 'manual_admin' }],
        matelso_calls: 1,
        aircall_calls: 1,
      }),
    )
    expect(r.status).toBe('warn')
    expect(r.detail).toMatch(/nie/i)
  })

  it('B7: echte lexdrive-Inbound-Zeilen zaehlen weiterhin normal', async () => {
    const r = await webhookInboundSilentCheck.run(
      makeCtx({
        webhook_events: [{ created_at: daysAgoIso(1), source: 'lexdrive' }],
        matelso_calls: 1,
        aircall_calls: 1,
      }),
    )
    expect(r.status).toBe('ok')
  })
})
