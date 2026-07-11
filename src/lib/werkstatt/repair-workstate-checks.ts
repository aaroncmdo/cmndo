// Reparatur-Workstate-Reconciliation-Lens (WS6 Slice 2, Teil 6).
// Wiederholbare Integritaets-Pruefung fuer Selbstzahler-/Kasko-Reparatur-Claims, die stecken
// bleiben. Konsumenten: Cron `api/cron/repair-workstate-check` (periodisch) + Admin-Action
// `pruefeReparaturWorkstate` (on-demand im Admin-Dashboard).
//
// Checks:
//   erledigt_nicht_geschlossen  — Termin erledigt, Claim noch nicht abgeschlossen (WS6-Close-Flip fehlgeschlagen)
//   keine_werkstatt_zugewiesen  — Reparatur-Claim >48h ohne Werkstatt (Zuweisung steckt)
//   termin_ueberfaellig_nicht_erledigt — bestaetigter Termin >3d in der Vergangenheit, Termin nicht erledigt
//
// Analog zu termine-integrity-checks: reine Detektions-Helfer (testbar ohne DB) + duenner DB-Glue.
// Graceful: ein Query-Fehler wird zu einem 'warning'-Finding, nie zum Crash.

import type { SupabaseClient } from '@supabase/supabase-js'

export type ReparaturWorkstateCheck =
  | 'erledigt_nicht_geschlossen'
  | 'keine_werkstatt_zugewiesen'
  | 'termin_ueberfaellig_nicht_erledigt'

export type ReparaturWorkstateFinding = {
  check: ReparaturWorkstateCheck
  severity: 'critical' | 'warning'
  tabelle: string
  count: number
  detail: string
  beispiel_ids?: string[]
}

export type ReparaturWorkstateReport = {
  ok: boolean // true = 0 Findings
  geprueft: number // Anzahl gefahrener Check-Kategorien
  findings: ReparaturWorkstateFinding[]
}

// Minimaltypen fuer die reinen Pruef-Helfer — exakt die Felder die sie brauchen.

export type ReparaturTerminRow = {
  id: string
  claim_id: string
  werkstatt_id: string
  status: string
  bestaetigter_termin: string | null
  erledigt_am: string | null
}

export type ClaimReparaturRow = {
  id: string
  operative_status: string | null
  abrechnungsweg: string | null
  reparatur_werkstatt_id: string | null
  konvertiert_am: string | null
}

// ── Terminale Claim-Zustaende ────────────────────────────────────────────────

const CLAIM_TERMINAL = new Set(['abgeschlossen', 'storniert', 'abgelehnt', 'verjaehrt'])

// ── Reine Detektions-Helfer (testbar ohne DB) ────────────────────────────────

/**
 * Erkennt den WS6-Close-Flip-Fehler: Reparatur-Termin mit status='erledigt', aber Claim
 * noch nicht in einem Terminal-Zustand. Das Close-Flip in der Werkstatt-Action haette
 * operative_status='abgeschlossen' setzen muessen.
 */
export function istErledigtNichtGeschlossen(
  termin: Pick<ReparaturTerminRow, 'status'>,
  claim: Pick<ClaimReparaturRow, 'operative_status'>,
): boolean {
  if (termin.status !== 'erledigt') return false
  const status = claim.operative_status ?? ''
  return !CLAIM_TERMINAL.has(status)
}

const REPARATUR_ABRECHNUNGSWEGE = new Set(['selbstzahler', 'kasko'])
const ZWEI_TAGE_MS = 48 * 60 * 60 * 1000

/**
 * Erkennt haegende Reparatur-Claims: abrechnungsweg IN ('selbstzahler','kasko'), nicht terminal,
 * keine Werkstatt zugewiesen, und aelter als 48h (gemessen an konvertiert_am).
 */
export function istKeineWerkstattZugewiesen(
  claim: Pick<ClaimReparaturRow, 'id' | 'operative_status' | 'abrechnungsweg' | 'reparatur_werkstatt_id' | 'konvertiert_am'>,
  now: Date = new Date(),
): boolean {
  if (!REPARATUR_ABRECHNUNGSWEGE.has(claim.abrechnungsweg ?? '')) return false
  if (CLAIM_TERMINAL.has(claim.operative_status ?? '')) return false
  if (claim.reparatur_werkstatt_id != null) return false
  if (claim.konvertiert_am == null) return false
  const alter = now.getTime() - Date.parse(claim.konvertiert_am)
  if (Number.isNaN(alter) || alter < ZWEI_TAGE_MS) return false
  return true
}

const DREI_TAGE_MS = 3 * 24 * 60 * 60 * 1000

/**
 * Erkennt bestaetigt-Termine deren bestaetigter_termin mehr als 3 Tage in der Vergangenheit
 * liegt, aber der Termin noch nicht auf 'erledigt' gesetzt wurde. Inject `now` fuer Tests.
 */
export function istTerminUeberfaelligNichtErledigt(
  termin: Pick<ReparaturTerminRow, 'status' | 'bestaetigter_termin'>,
  now: Date = new Date(),
): boolean {
  if (termin.status !== 'bestaetigt') return false
  if (termin.bestaetigter_termin == null) return false
  const terminMs = Date.parse(termin.bestaetigter_termin)
  if (Number.isNaN(terminMs)) return false
  return now.getTime() - terminMs > DREI_TAGE_MS
}

// ── DB-Orchestrierung ────────────────────────────────────────────────────────

/**
 * Faehrt alle Reparatur-Workstate-Checks gegen die DB und liefert einen strukturierten Report.
 * Braucht einen service-role-Client (createAdminClient) — RLS-unabhaengig.
 * Injectable `now` fuer Tests (default: new Date()).
 */
export async function runReparaturWorkstateChecks(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<ReparaturWorkstateReport> {
  const geprueft = 3
  const from = (t: string) => (db as unknown as { from: (t: string) => ReturnType<SupabaseClient['from']> }).from(t)

  const findings: ReparaturWorkstateFinding[] = []

  // ── Check 1: erledigt_nicht_geschlossen ─────────────────────────────────
  {
    const { data: termine, error: terminErr } = await from('reparatur_termine')
      .select('id, claim_id, status')
      .eq('status', 'erledigt')

    if (terminErr) {
      findings.push({
        check: 'erledigt_nicht_geschlossen',
        severity: 'warning',
        tabelle: 'reparatur_termine',
        count: 0,
        detail: `Query-Fehler: ${terminErr.message}`,
      })
    } else {
      const erledigtClaimIds = ((termine ?? []) as Array<{ id: string; claim_id: string; status: string }>)
        .map((t) => t.claim_id)
        .filter(Boolean)

      if (erledigtClaimIds.length > 0) {
        const { data: claims, error: claimErr } = await from('claims')
          .select('id, operative_status')
          .in('id', erledigtClaimIds)

        if (claimErr) {
          findings.push({
            check: 'erledigt_nicht_geschlossen',
            severity: 'warning',
            tabelle: 'claims',
            count: 0,
            detail: `Query-Fehler: ${claimErr.message}`,
          })
        } else {
          const claimMap = new Map<string, string | null>(
            ((claims ?? []) as Array<{ id: string; operative_status: string | null }>).map((c) => [c.id, c.operative_status]),
          )

          const verletzt = ((termine ?? []) as Array<{ id: string; claim_id: string; status: string }>).filter((t) => {
            const status = claimMap.get(t.claim_id) ?? null
            return istErledigtNichtGeschlossen({ status: t.status }, { operative_status: status })
          })

          if (verletzt.length > 0) {
            findings.push({
              check: 'erledigt_nicht_geschlossen',
              severity: 'critical',
              tabelle: 'reparatur_termine',
              count: verletzt.length,
              detail: `${verletzt.length} Reparatur-Termin(e) mit status='erledigt', aber Claim nicht abgeschlossen (WS6-Close-Flip fehlgeschlagen)`,
              beispiel_ids: verletzt.map((t) => t.claim_id).slice(0, 5),
            })
          }
        }
      }
    }
  }

  // ── Check 2: keine_werkstatt_zugewiesen ─────────────────────────────────
  {
    const { data: claims, error: claimErr } = await from('claims')
      .select('id, operative_status, abrechnungsweg, reparatur_werkstatt_id, konvertiert_am')
      .in('abrechnungsweg', ['selbstzahler', 'kasko'])
      .is('reparatur_werkstatt_id', null)

    if (claimErr) {
      findings.push({
        check: 'keine_werkstatt_zugewiesen',
        severity: 'warning',
        tabelle: 'claims',
        count: 0,
        detail: `Query-Fehler: ${claimErr.message}`,
      })
    } else {
      const verletzt = (
        (claims ?? []) as Array<{
          id: string
          operative_status: string | null
          abrechnungsweg: string | null
          reparatur_werkstatt_id: string | null
          konvertiert_am: string | null
        }>
      ).filter((c) => istKeineWerkstattZugewiesen(c, now))

      if (verletzt.length > 0) {
        findings.push({
          check: 'keine_werkstatt_zugewiesen',
          severity: 'warning',
          tabelle: 'claims',
          count: verletzt.length,
          detail: `${verletzt.length} Reparatur-Claim(s) (selbstzahler/kasko) ohne Werkstatt-Zuweisung seit mehr als 48h`,
          beispiel_ids: verletzt.map((c) => c.id).slice(0, 5),
        })
      }
    }
  }

  // ── Check 3: termin_ueberfaellig_nicht_erledigt ──────────────────────────
  {
    const { data: termine, error: terminErr } = await from('reparatur_termine')
      .select('id, claim_id, status, bestaetigter_termin')
      .eq('status', 'bestaetigt')
      .not('bestaetigter_termin', 'is', null)

    if (terminErr) {
      findings.push({
        check: 'termin_ueberfaellig_nicht_erledigt',
        severity: 'warning',
        tabelle: 'reparatur_termine',
        count: 0,
        detail: `Query-Fehler: ${terminErr.message}`,
      })
    } else {
      const verletzt = (
        (termine ?? []) as Array<{
          id: string
          claim_id: string
          status: string
          bestaetigter_termin: string | null
        }>
      ).filter((t) => istTerminUeberfaelligNichtErledigt(t, now))

      if (verletzt.length > 0) {
        findings.push({
          check: 'termin_ueberfaellig_nicht_erledigt',
          severity: 'warning',
          tabelle: 'reparatur_termine',
          count: verletzt.length,
          detail: `${verletzt.length} bestaetigt(e) Reparatur-Termin(e) mit bestaetigter_termin mehr als 3 Tage in der Vergangenheit (Werkstatt hat Erledigung nicht gesetzt)`,
          beispiel_ids: verletzt.map((t) => t.claim_id).slice(0, 5),
        })
      }
    }
  }

  return { ok: findings.length === 0, geprueft, findings }
}
