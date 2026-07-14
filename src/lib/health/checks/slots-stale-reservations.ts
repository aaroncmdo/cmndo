// Health-Check: Slots-Stale-Reservations
// Erkennt ENTWURF-Slot-Reservierungen in gutachter_finder_anfragen, die seit mehr
// als 24 Stunden gehalten werden (slot-ttl-cleanup-Cron haette sie freigeben muessen).
// WICHTIG — nur status='entwurf': das ist die einzige Rolle des TTL-Crons. Bei
// bestaetigten/aktiven Buchungen sind reservierter_slot_von/bis KEIN staler Hold,
// sondern der Buchungs-Record selbst — onboarding/slots.ts liest sie fuer
// status NOT IN (abgeschlossen,storniert,entwurf) als aktive SV-Belegung (Doppel-
// buchungs-Schutz). Ohne den entwurf-Filter wuerde der Check jede alte bestaetigte
// Buchung als "stale" false-positiven (das war der Grund fuer die 62d-"stale"-Reste).
// Read-only auf gutachter_finder_anfragen.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task3

import type { HealthCheck, CheckResult } from '@/lib/health/types'

// Schwelle fuer Crit: Reservierung aelter als 7 Tage (168 Stunden)
const CRIT_ALTER_H = 168

type SlotRow = {
  reservierter_slot_von: string
}

export const slotsStaleReservationsCheck: HealthCheck = {
  id: 'slots-stale-reservations',
  category: 'cron',
  title: 'Veraltete Slot-Reservierungen',

  async run(ctx): Promise<CheckResult> {
    // Zeilen-basierter Fetch: PostgREST-Filter statt SQL-Aggregate im select().
    const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    const { data, error } = await ctx.supabase
      .from('gutachter_finder_anfragen')
      .select('reservierter_slot_von')
      // NUR entwurf-Soft-Holds: die einzigen, die der TTL-Cron freigibt. Bestaetigte
      // Buchungen behalten reservierter_slot_von legitim als Belegungs-Record.
      .eq('status', 'entwurf')
      .not('reservierter_slot_von', 'is', null)
      .lt('reservierter_slot_von', cutoff)

    if (error) {
      return {
        status: 'error',
        detail: `DB-Fehler beim Pruefen der Slot-Reservierungen: ${error.message}`,
      }
    }

    const rows: SlotRow[] = (data ?? []) as SlotRow[]

    // JS-seitige Aggregation
    const nStale = rows.length
    const aeltesterH =
      rows.length > 0
        ? Math.round(Math.max(...rows.map((r) => (Date.now() - new Date(r.reservierter_slot_von).getTime()) / 3_600_000)))
        : null

    if (nStale === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Keine veralteten Slot-Reservierungen (>24h) gefunden.',
      }
    }

    // Stunden in Tage fuer lesbaren Detail-Text umrechnen
    const alterAnzeige =
      aeltesterH !== null ? (aeltesterH >= 48 ? `${Math.round(aeltesterH / 24)}d` : `${aeltesterH}h`) : '?'

    const isCrit = aeltesterH !== null && aeltesterH > CRIT_ALTER_H
    const status = isCrit ? 'crit' : 'warn'

    return {
      status,
      metric: nStale,
      detail: `${nStale} Entwurf-Slot-Reservierungen >24h gehalten (älteste ${alterAnzeige}) — slot-ttl-cleanup prüfen`,
    }
  },
}
