// Health-Check: Pflicht-ENV-Konfiguration
// Prueft process.env auf fehlende Pflicht-Variablen — kein DB-Zugriff.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task5
//
// Kategorien:
//   VAPID-Paar (web_push): NEXT_PUBLIC_VAPID_PUBLIC_KEY + VAPID_PRIVATE_KEY
//   Kanzlei-SF (nur wenn KANZLEI_API_ENABLED='true'):
//     KANZLEI_SF_API_URL + KANZLEI_SF_CLIENT_ID + KANZLEI_SF_CLIENT_SECRET
//   Email-Provider (mind. eines): RESEND_API_KEY ODER GMAIL_SMTP_USER
//
// Status:
//   crit — kein Email-Provider gesetzt
//   warn — VAPID unvollstaendig oder Kanzlei-SF-Vars fehlen
//   ok   — alle Pflicht-ENV gesetzt

import type { HealthCheck, CheckResult, CheckCtx } from '@/lib/health/types'

function isSet(val: string | undefined): boolean {
  return typeof val === 'string' && val.trim().length > 0
}

export const configRequiredEnvCheck: HealthCheck = {
  id: 'config-required-env',
  category: 'config',
  title: 'Pflicht-ENV-Konfiguration',

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async run(_ctx: CheckCtx): Promise<CheckResult> {
    const missing: string[] = []
    let emailProviderMissing = false

    // --- Email-Provider (mind. einer) ---
    const hasResend = isSet(process.env.RESEND_API_KEY)
    const hasGmail = isSet(process.env.GMAIL_SMTP_USER)
    if (!hasResend && !hasGmail) {
      emailProviderMissing = true
      missing.push('RESEND_API_KEY oder GMAIL_SMTP_USER')
    }

    // --- VAPID-Paar fuer web_push ---
    const hasVapidPublic = isSet(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY)
    const hasVapidPrivate = isSet(process.env.VAPID_PRIVATE_KEY)
    if (!hasVapidPublic || !hasVapidPrivate) {
      if (!hasVapidPublic) missing.push('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
      if (!hasVapidPrivate) missing.push('VAPID_PRIVATE_KEY')
    }

    // --- Kanzlei-Salesforce (nur wenn Feature aktiv) ---
    if (process.env.KANZLEI_API_ENABLED === 'true') {
      if (!isSet(process.env.KANZLEI_SF_API_URL)) missing.push('KANZLEI_SF_API_URL')
      if (!isSet(process.env.KANZLEI_SF_CLIENT_ID)) missing.push('KANZLEI_SF_CLIENT_ID')
      if (!isSet(process.env.KANZLEI_SF_CLIENT_SECRET)) missing.push('KANZLEI_SF_CLIENT_SECRET')
    }

    if (emailProviderMissing) {
      return {
        status: 'crit',
        metric: missing.length,
        detail: `Fehlende Pflicht-ENV: ${missing.join(', ')}`,
      }
    }

    if (missing.length > 0) {
      return {
        status: 'warn',
        metric: missing.length,
        detail: `Fehlende Pflicht-ENV: ${missing.join(', ')}`,
      }
    }

    return {
      status: 'ok',
      metric: 0,
      detail: 'Alle Pflicht-ENV gesetzt.',
    }
  },
}
