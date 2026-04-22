// AAR-436: Admin-Dashboard für Anthropic-Token-Usage und Cache-Hit-Rate.
// Zeigt die letzten 7 Tage pro Endpoint (faq_bot_kunde, faq_bot_kb,
// pre_call_briefing, post_call_summary, …) mit Input-, Output-, Cache-
// Read- und Cache-Write-Tokens plus berechneter Cache-Hit-Rate.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

type UsageRow = {
  endpoint: string
  model: string | null
  input_tokens: number | null
  output_tokens: number | null
  cache_creation_input_tokens: number | null
  cache_read_input_tokens: number | null
  created_at: string
}

type AggregatedRow = {
  endpoint: string
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  cacheHitRate: number | null
}

export const dynamic = 'force-dynamic'

export default async function KiUsagePage() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  // AAR-719: Defensiv — Admin-Layout filtert eigentlich schon, aber wenn
  // ein Nicht-Admin hier durchrutscht, ins eigene Portal statt /admin.
  if (profile?.rolle !== 'admin') {
    const { roleToPath } = await import('@/lib/auth/role-redirect')
    redirect(roleToPath(profile?.rolle as string | null | undefined))
  }

  const admin = createAdminClient()
  const sinceIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data: rows } = await admin
    .from('ai_usage_log')
    .select('endpoint, model, input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens, created_at')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(5000)

  const usageRows = (rows ?? []) as UsageRow[]

  // Aggregation pro Endpoint
  const aggMap = new Map<string, AggregatedRow>()
  for (const r of usageRows) {
    const key = r.endpoint
    const existing = aggMap.get(key) ?? {
      endpoint: key,
      calls: 0,
      inputTokens: 0,
      outputTokens: 0,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      cacheHitRate: null,
    }
    existing.calls += 1
    existing.inputTokens += r.input_tokens ?? 0
    existing.outputTokens += r.output_tokens ?? 0
    existing.cacheReadTokens += r.cache_read_input_tokens ?? 0
    existing.cacheWriteTokens += r.cache_creation_input_tokens ?? 0
    aggMap.set(key, existing)
  }
  for (const row of aggMap.values()) {
    const total = row.cacheReadTokens + row.cacheWriteTokens
    row.cacheHitRate = total > 0 ? row.cacheReadTokens / total : null
  }

  const aggregated = Array.from(aggMap.values()).sort((a, b) => b.calls - a.calls)

  // Gesamt-Kennzahlen
  const totalCalls = aggregated.reduce((s, r) => s + r.calls, 0)
  const totalCacheRead = aggregated.reduce((s, r) => s + r.cacheReadTokens, 0)
  const totalCacheWrite = aggregated.reduce((s, r) => s + r.cacheWriteTokens, 0)
  const totalCacheHitRate =
    totalCacheRead + totalCacheWrite > 0
      ? totalCacheRead / (totalCacheRead + totalCacheWrite)
      : null

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 space-y-6">
      <header>
        <h1 className="text-xl font-semibold text-[#0D1B3E]">KI-Usage & Cache-Hit-Rate</h1>
        <p className="text-sm text-gray-500">
          Anthropic-Token-Verbrauch der letzten 7 Tage. Cache-Hit-Rate &gt;= 80% gilt
          als „warm" nach AAR-436.
        </p>
      </header>

      <section className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Calls (7 Tage)</div>
          <div className="text-2xl font-semibold text-[#0D1B3E]">{totalCalls.toLocaleString('de-DE')}</div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Cache-Hit-Rate</div>
          <div className="text-2xl font-semibold text-[#0D1B3E]">
            {totalCacheHitRate != null ? `${(totalCacheHitRate * 100).toFixed(1)}%` : '—'}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            {totalCacheRead.toLocaleString('de-DE')} read / {totalCacheWrite.toLocaleString('de-DE')} write
          </div>
        </div>
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="text-[11px] uppercase tracking-wider text-gray-500">Endpoints aktiv</div>
          <div className="text-2xl font-semibold text-[#0D1B3E]">{aggregated.length}</div>
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900">Pro Endpoint</h2>
        </div>
        {aggregated.length === 0 ? (
          <div className="p-6 text-sm text-gray-500 text-center">
            Keine Usage-Daten in den letzten 7 Tagen.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-500">
              <tr>
                <th className="text-left px-4 py-2">Endpoint</th>
                <th className="text-right px-4 py-2">Calls</th>
                <th className="text-right px-4 py-2">Input</th>
                <th className="text-right px-4 py-2">Output</th>
                <th className="text-right px-4 py-2">Cache-Read</th>
                <th className="text-right px-4 py-2">Cache-Write</th>
                <th className="text-right px-4 py-2">Hit-Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aggregated.map((row) => (
                <tr key={row.endpoint}>
                  <td className="px-4 py-2 font-medium text-gray-900">{row.endpoint}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{row.calls.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{row.inputTokens.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{row.outputTokens.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{row.cacheReadTokens.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-2 text-right text-gray-700">{row.cacheWriteTokens.toLocaleString('de-DE')}</td>
                  <td className="px-4 py-2 text-right text-gray-900 font-medium">
                    {row.cacheHitRate != null ? `${(row.cacheHitRate * 100).toFixed(1)}%` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
