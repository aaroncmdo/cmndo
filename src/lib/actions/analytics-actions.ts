'use server'

import { createClient } from '@/lib/supabase/server'
import { getUmsatz, getKosten, getCashFlow, getSvPerformanceList, getConversionFunnel, getYtdRange } from '@/lib/analytics'
import type { AnalyticsFilter } from '@/lib/analytics'

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (!['admin', 'kundenbetreuer'].includes(profile?.rolle ?? '')) throw new Error('Kein Zugriff')
}

export async function getFinanceOverview(filter?: AnalyticsFilter) {
  await requireAdmin()
  const f = filter ?? getYtdRange()
  const [umsatz, kosten, cashFlow] = await Promise.all([
    getUmsatz(f),
    getKosten(f),
    getCashFlow(f),
  ])
  return { umsatz, kosten, cashFlow }
}

export async function getSvPerformance(filter?: AnalyticsFilter) {
  await requireAdmin()
  return getSvPerformanceList(filter)
}

export async function getConversion(filter?: AnalyticsFilter) {
  await requireAdmin()
  return getConversionFunnel(filter)
}
