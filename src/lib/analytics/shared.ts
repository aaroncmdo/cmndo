import { createAdminClient } from '@/lib/supabase/admin'

export type AnalyticsFilter = {
  startDate?: string
  endDate?: string
  svId?: string
  kanzleiId?: string
}

export type DrillDownItem = {
  id: string
  label: string
  sublabel?: string
  betrag?: number
  datum?: string
  link?: string
}

/** EUR-Format */
export function eur(val: number): string {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(val)
}

/** Monats-Range berechnen */
export function getMonthRange(monat: string): AnalyticsFilter {
  const d = new Date(monat + '-01T00:00:00Z')
  const startDate = d.toISOString()
  const nextMonth = new Date(d)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  return { startDate, endDate: nextMonth.toISOString() }
}

/** YTD-Range */
export function getYtdRange(): AnalyticsFilter {
  const now = new Date()
  const startDate = new Date(now.getFullYear(), 0, 1).toISOString()
  return { startDate, endDate: now.toISOString() }
}

export function getDb() { return createAdminClient() }
