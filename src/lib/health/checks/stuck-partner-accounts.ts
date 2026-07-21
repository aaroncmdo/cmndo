// Health-Check: Stuck-Partner-Accounts
// Erkennt Partner-Accounts, die seit >7 Tagen auf force_password_change=true stehen
// UND sich noch NIE eingeloggt haben — der Erst-Login wurde nie vollzogen. Moegliche
// Ursache: die Zugangs-/Willkommens-Mail kam nicht an oder der Partner hat sie nicht
// bearbeitet (Werkstatt-Incident 02.07.: 4 Werkstaetten tot bei Geburt, weil
// createWerkstatt keine Mail schickte). Ohne den Check verrotten solche Geist-Accounts still.
//
// Die Erkennungs-Logik liegt im geteilten Detektor src/lib/partner/stuck-accounts.ts —
// derselbe, den der Cron partner-aktivierung-nachfassen nutzt. Dieser Check BEOBACHTET
// nur (Metrik/Alert); das Handeln (Vertriebs-Task je Partner) macht der Cron.
//
// WICHTIG (03.07., Prod-Smoke): nur nie-eingeloggte Accounts flaggen.
// force_password_change=true bleibt bei manchen Accounts stehen, OBWOHL sie sich
// laengst eingeloggt haben (der Flag wird nicht auf jedem Login-Pfad geraeumt) —
// so ein Account ist per Definition NICHT "ohne Erst-Login" und war die Quelle von
// Fehlalarmen. Der Detektor prueft deshalb pro Kandidat den echten Login-Status
// (auth.admin.getUserById -> last_sign_in_at) und filtert interne/Test-Identitaeten
// via istInterneEmail heraus. Die Alters-Schwelle steht auf 7 Tagen (nicht 48h): ein
// vor 2-3 Tagen eingeladener Partner, der noch nicht drin war, ist normaler
// Onboarding-Verzug, kein Stall.
//
// Kunden (rolle='kunde') sind BEWUSST ausgeschlossen: die greifen ueber Flow-/
// Magic-Links zu, force_password_change=true ist dort erwartet + harmlos.
// Read-only; braucht den service_role-Client (auth.admin.getUserById im Detektor).

import type { HealthCheck, CheckResult } from '@/lib/health/types'
import { findStuckPartnerAccounts } from '@/lib/partner/stuck-accounts'

// Rollen mit Passwort-Portal-Login (Kunde nutzt Magic-Link -> ausgeschlossen;
// admin/dispatch werden anders angelegt). MUSS ausschliesslich gueltige user_role-
// Enum-Werte enthalten — ein unbekannter Wert laesst Postgres die GESAMTE .in()-Query
// mit "invalid input value for enum user_role" abweisen (der Check erroret dann still).
// Exportiert fuer den Enum-Integritaets-Test.
export const PARTNER_ROLLEN: string[] = [
  'werkstatt',
  'sachverstaendiger',
  'makler',
  'kundenbetreuer',
]
const STUCK_ALTER_TAGE = 7
const CRIT_AB = 5

export const stuckPartnerAccountsCheck: HealthCheck = {
  id: 'stuck-partner-accounts',
  category: 'funnel',
  title: 'Partner ohne Erst-Login (force_password_change)',

  async run(ctx): Promise<CheckResult> {
    const res = await findStuckPartnerAccounts(ctx.supabase, {
      rollen: PARTNER_ROLLEN,
      alterTage: STUCK_ALTER_TAGE,
    })
    if (!res.ok) {
      return { status: 'error', detail: `DB-Fehler beim Prüfen der Partner-Accounts: ${res.error}` }
    }

    const rows = res.partner
    const n = rows.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Keine Partner hängen im Erst-Login (>7 Tage, nie eingeloggt, force_password_change=true).',
      }
    }

    const byRolle: Record<string, number> = {}
    for (const r of rows) byRolle[r.rolle] = (byRolle[r.rolle] ?? 0) + 1
    const breakdown = Object.entries(byRolle)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${v}× ${k}`)
      .join(', ')

    const status = n >= CRIT_AB ? 'crit' : 'warn'
    return {
      status,
      metric: n,
      detail: `${n} Partner-Account(s) >7 Tage ohne Erst-Login (nie eingeloggt, force_password_change=true): ${breakdown} — Aktivierung nachfassen, Zugangs-Mail ggf. erneut senden`,
      sampleIds: rows.slice(0, 5).map((r) => r.email || r.userId),
    }
  },
}
