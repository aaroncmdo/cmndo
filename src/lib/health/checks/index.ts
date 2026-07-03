// Registry aller Health-Checks.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task6
//
// Reihenfolge: funnel -> cron/slots -> sends -> config
import type { HealthCheck } from '@/lib/health/types'
import { funnelStuckClaimsCheck } from './funnel-stuck-claims'
import { funnelStalledFlowCheck } from './funnel-stalled-flow'
import { stuckPartnerAccountsCheck } from './stuck-partner-accounts'
import { slotsStaleReservationsCheck } from './slots-stale-reservations'
import { remindersOverdueCheck } from './reminders-overdue'
import { emailFailureRateCheck } from './email-failure-rate'
import { twilioSendFailuresCheck } from './twilio-send-failures'
import { webhookInboundSilentCheck } from './webhook-inbound-silent'
import { configRequiredEnvCheck } from './config-required-env'

export const ALL_CHECKS: HealthCheck[] = [
  funnelStuckClaimsCheck,
  funnelStalledFlowCheck,
  stuckPartnerAccountsCheck,
  slotsStaleReservationsCheck,
  remindersOverdueCheck,
  emailFailureRateCheck,
  twilioSendFailuresCheck,
  webhookInboundSilentCheck,
  configRequiredEnvCheck,
]
