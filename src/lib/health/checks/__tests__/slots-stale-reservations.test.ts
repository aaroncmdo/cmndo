// TDD-Tests fuer slots-stale-reservations Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task3
// Kein echter DB-Zugriff — Fake-CheckCtx mit Supabase-Stub.
//
// Der Check liest gutachter_finder_anfragen:
//   status='entwurf' AND reservierter_slot_von IS NOT NULL AND < now() - interval '24 hours'
//   (nur entwurf-Holds — bestaetigte Buchungen behalten reservierter_slot_von legitim)
// und aggregiert in JS: nStale=rows.length, aeltesterH=max(now-reservierter_slot_von in h).
// Schwellen: 0 -> ok; >0 -> warn; aeltesterH > 168 (7 Tage) -> crit.

import { describe, it, expect } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { slotsStaleReservationsCheck } from '../slots-stale-reservations'

// ---------------------------------------------------------------------------
// Hilfsfunktion: erzeugt einen ISO-String, der `ageH` Stunden in der Vergangenheit liegt.
// ---------------------------------------------------------------------------
function hoursAgoIso(ageH: number): string {
  return new Date(Date.now() - ageH * 3_600_000).toISOString()
}

// ---------------------------------------------------------------------------
// Stub-Factory: liefert eine CheckCtx, deren supabase.from('gutachter_finder_anfragen')
// ein Zeilen-Array { reservierter_slot_von } zurueckgibt.
//
// params:
//   nStale    — Anzahl der zurueckgelieferten Zeilen (= Anzahl staler Reservierungen)
//   aeltesterH — Alter der aeltesten Zeile in Stunden (restliche Zeilen 1h juenger gesetzt)
// ---------------------------------------------------------------------------
function makeCtx(
  nStale: number,
  aeltesterH: number | null,
  eqCalls?: Array<{ col: string; val: unknown }>,
): CheckCtx {
  // Rows so bauen, dass JS-Aggregat nStale und aeltesterH exakt trifft.
  const rows: { reservierter_slot_von: string }[] =
    nStale === 0
      ? []
      : Array.from({ length: nStale }, (_, i) => ({
          // Aelteste Zeile bekommt aeltesterH, Rest 1h juenger
          reservierter_slot_von: hoursAgoIso(aeltesterH !== null ? (i === 0 ? aeltesterH : aeltesterH - 1) : 25),
        }))

  const supabase = {
    from(table: string) {
      if (table !== 'gutachter_finder_anfragen') {
        throw new Error(`unerwartete Tabelle: ${table}`)
      }
      // Simuliert: .select('reservierter_slot_von').eq(...).not(...).lt(...) -> Array
      return {
        select: (_cols: string) => ({
          eq: (col: string, val: unknown) => {
            eqCalls?.push({ col, val })
            return {
              not: (_col: string, _op: string, _val: unknown) => ({
                lt: (_col2: string, _cutoff: string) =>
                  Promise.resolve({ data: rows, error: null }),
              }),
            }
          },
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
          eq: (_col: string, _val: unknown) => ({
            not: (_col2: string, _op: string, _val2: unknown) => ({
              lt: (_col3: string, _cutoff: string) =>
                Promise.resolve({ data: null, error: { message: errorMessage } }),
            }),
          }),
        }),
      }
    },
  } as unknown as CheckCtx['supabase']
  return { supabase }
}

describe('slotsStaleReservationsCheck', () => {
  it('hat korrekte id und category', () => {
    expect(slotsStaleReservationsCheck.id).toBe('slots-stale-reservations')
    expect(slotsStaleReservationsCheck.category).toBe('cron')
  })

  it('liefert ok wenn keine veralteten Reservierungen vorhanden (n_stale=0)', async () => {
    const ctx = makeCtx(0, null)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
    expect(result.detail).toMatch(/0|keine/i)
  })

  it('liefert ok wenn Daten-Zeile komplett null ist (leere Tabelle)', async () => {
    const ctx = makeCtx(0, null)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
  })

  it('liefert warn wenn n_stale > 0 und aeltester_h <= 168', async () => {
    const ctx = makeCtx(3, 36)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(3)
    expect(result.detail).toContain('3')
    expect(result.detail).toContain('slot-ttl-cleanup')
  })

  it('liefert warn auch bei n_stale=1', async () => {
    const ctx = makeCtx(1, 25)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('warn')
    expect(result.metric).toBe(1)
  })

  it('liefert crit wenn aeltester_h > 168 (7 Tage)', async () => {
    const ctx = makeCtx(2, 200)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('crit')
    expect(result.metric).toBe(2)
    expect(result.detail).toContain('slot-ttl-cleanup')
  })

  it('liefert crit bei genau 169h (Grenzfall: > 168)', async () => {
    const ctx = makeCtx(5, 169)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('crit')
  })

  it('liefert warn bei genau 168h (Grenzfall: nicht > 168)', async () => {
    const ctx = makeCtx(1, 168)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('warn')
  })

  it('detail enthaelt Stunden-Angabe bei alten Reservierungen', async () => {
    const ctx = makeCtx(4, 96)
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.detail).toMatch(/96|4d/)
  })

  it('liefert error bei DB-Fehler', async () => {
    const ctx = makeErrCtx('connection refused')
    const result = await slotsStaleReservationsCheck.run(ctx)
    expect(result.status).toBe('error')
    expect(result.detail).toContain('connection refused')
  })

  it('scopet die Query auf status=entwurf (bestaetigte/aktive Buchungen NICHT als stale flaggen)', async () => {
    // Regression-Pin: onboarding/slots.ts liest reservierter_slot_von bestaetigter
    // Buchungen als aktive SV-Belegung -> der Check darf NUR entwurf-Holds zaehlen,
    // sonst false-positiven alte bestaetigte Buchungen (das waren die 62d-"stale"-Reste).
    const eqCalls: Array<{ col: string; val: unknown }> = []
    const ctx = makeCtx(2, 30, eqCalls)
    await slotsStaleReservationsCheck.run(ctx)
    expect(eqCalls).toContainEqual({ col: 'status', val: 'entwurf' })
  })
})
