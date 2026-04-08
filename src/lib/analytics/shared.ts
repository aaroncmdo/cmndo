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
export function getMonthRange(monat: string): { start: string; end: string } {
  const d = new Date(monat + '-01T00:00:00Z')
  const start = d.toISOString()
  const nextMonth = new Date(d)
  nextMonth.setMonth(nextMonth.getMonth() + 1)
  return { start, end: nextMonth.toISOString() }
}

/** YTD-Range */
export function getYtdRange(): { start: string; end: string } {
  const now = new Date()
  const start = new Date(now.getFullYear(), 0, 1).toISOString()
  return { start, end: now.toISOString() }
}

export function getDb() { return createAdminClient() }
