// Health-Check: Stuck-Partner-Accounts
// Erkennt Partner-/Staff-Accounts, die seit >48h auf force_password_change=true
// stehen — der Erst-Login wurde nie abgeschlossen (Passwort nie gesetzt). Haeufigste
// Ursache: bei der Anlage ging keine Zugangs-/Willkommens-Mail raus, der Partner
// weiss nicht mal, dass er einen Account hat (Werkstatt-Incident 02.07.: 4 Werk-
// staetten tot bei Geburt, weil createWerkstatt keine Mail schickte). Ohne diesen
// Check verrotten solche Geist-Accounts still — Partner kommen nie ins Portal.
//
// Kunden (rolle='kunde') sind BEWUSST ausgeschlossen: die greifen ueber Flow-/
// Magic-Links zu, force_password_change=true ist dort erwartet + harmlos.
// Read-only auf profiles.

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
const STUCK_ALTER_H = 48
const CRIT_AB = 5

type ProfRow = { id: string; email: string | null; rolle: string; created_at: string | null }

export const stuckPartnerAccountsCheck: HealthCheck = {
  id: 'stuck-partner-accounts',
  category: 'funnel',
  title: 'Partner ohne Erst-Login (force_password_change)',

  async run(ctx): Promise<CheckResult> {
    const cutoff = new Date(Date.now() - STUCK_ALTER_H * 3600 * 1000).toISOString()
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

    const rows: ProfRow[] = (data ?? []) as ProfRow[]
    const n = rows.length

    if (n === 0) {
      return {
        status: 'ok',
        metric: 0,
        detail: 'Keine Partner hängen im Erst-Login (>48h mit force_password_change=true).',
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
      detail: `${n} Partner-Account(s) >48h ohne Erst-Login (force_password_change=true): ${breakdown} — Zugangs-/Willkommens-Mail bei der Anlage prüfen`,
      sampleIds: rows.slice(0, 5).map((r) => r.email ?? r.id),
    }
  },
}
