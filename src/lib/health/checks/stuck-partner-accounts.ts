// Health-Check: Stuck-Partner-Accounts
// Erkennt Partner-Accounts, die seit >7 Tagen auf force_password_change=true stehen
// UND sich noch NIE eingeloggt haben (auth.users.last_sign_in_at leer) — der Erst-
// Login wurde nie vollzogen. Moegliche Ursache: die Zugangs-/Willkommens-Mail kam
// nicht an oder der Partner hat sie nicht bearbeitet (Werkstatt-Incident 02.07.: 4
// Werkstaetten tot bei Geburt, weil createWerkstatt keine Mail schickte). Ohne den
// Check verrotten solche Geist-Accounts still.
//
// WICHTIG (03.07., Prod-Smoke): der Check darf NUR nie-eingeloggte Accounts flaggen.
// force_password_change=true bleibt bei manchen Accounts stehen, OBWOHL sie sich
// laengst eingeloggt haben (der Flag wird nicht auf jedem Login-Pfad geraeumt) —
// so ein Account ist per Definition NICHT "ohne Erst-Login" und war die Quelle von
// Fehlalarmen. Deshalb: Kandidaten aus profiles vorfiltern, dann pro Kandidat via
// auth.admin.getUserById den echten Login-Status pruefen (last_sign_in_at). Und die
// Alters-Schwelle steht auf 7 Tagen (nicht 48h): ein vor 2-3 Tagen eingeladener
// Partner, der noch nicht drin war, ist normaler Onboarding-Verzug, kein Stall.
//
// Kunden (rolle='kunde') sind BEWUSST ausgeschlossen: die greifen ueber Flow-/
// Magic-Links zu, force_password_change=true ist dort erwartet + harmlos.
// Read-only (profiles + auth.admin.getUserById); braucht den service_role-Client.

import type { HealthCheck, CheckResult } from '@/lib/health/types'

// Rollen mit Passwort-Portal-Login (Kunde nutzt Magic-Link -> ausgeschlossen;
// admin/dispatch werden anders angelegt). MUSS ausschliesslich gueltige user_role-
// Enum-Werte enthalten — .in('rolle', …) castet jeden Eintrag zum Enum, ein
// unbekannter Wert laesst Postgres die GESAMTE Query mit "invalid input value for
// enum user_role" abweisen (der Check erroret dann still). Exportiert fuer den
// Enum-Integritaets-Test.
export const PARTNER_ROLLEN: string[] = [
  'werkstatt',
  'sachverstaendiger',
  'makler',
  'kundenbetreuer',
]
const STUCK_ALTER_TAGE = 7
const CRIT_AB = 5

type ProfRow = { id: string; email: string | null; rolle: string; created_at: string | null }

export const stuckPartnerAccountsCheck: HealthCheck = {
  id: 'stuck-partner-accounts',
  category: 'funnel',
  title: 'Partner ohne Erst-Login (force_password_change)',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - STUCK_ALTER_TAGE * 24 * 3600 * 1000).toISOString()
    const { data, error } = await ctx.supabase
      .from('profiles')
      .select('id, email, rolle, created_at')
      .eq('force_password_change', true)
      .in('rolle', PARTNER_ROLLEN)
      .lt('created_at', cutoff)
      .not('email', 'ilike', '%@claimondo.test')

    if (error) {
      return { status: 'error', detail: `DB-Fehler beim Prüfen der Partner-Accounts: ${error.message}` }
    }

    const kandidaten: ProfRow[] = (data ?? []) as ProfRow[]

    // Nur Accounts behalten, die sich NIE eingeloggt haben. Ein Account mit
    // last_sign_in_at hat den Erst-Login vollzogen -> kein Stuck (auch wenn der
    // force_password_change-Flag stehen blieb). getUserById-Fehler = defensiv NICHT
    // flaggen (kein Fehlalarm, lieber unter- als uebermelden).
    const rows: ProfRow[] = []
    for (const k of kandidaten) {
      const { data: udata, error: uErr } = await ctx.supabase.auth.admin.getUserById(k.id)
      if (uErr) continue
      if (udata?.user && !udata.user.last_sign_in_at) rows.push(k)
    }
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
      sampleIds: rows.slice(0, 5).map((r) => r.email ?? r.id),
    }
  },
}
