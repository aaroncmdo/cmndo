// Pipeline-Health-Dashboard — Task 9
// Server-Component (kein 'use client'). Admin-Guard via createClient + profiles-Check.
// Liest health_check_runs: jüngste Zeile je check_id (JS-Dedup nach run_at desc).
// Design-Tokens: bg-success/-soft, text-warning-strong, bg-danger-soft — kein roh green/red.

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { SectionCard } from '@/components/shared/SectionCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import EmptyState from '@/components/shared/EmptyState'
import PageHeader from '@/components/shared/PageHeader'
import { ActivityIcon } from 'lucide-react'
import type { StatusBadgeTone } from '@/components/shared/StatusBadge'

export const dynamic = 'force-dynamic'

type HealthRun = {
  id: string
  check_id: string
  category: string
  status: string
  metric: number | null
  detail: string
  sample_ids: string[]
  alerted_at: string | null
  run_at: string
}

function statusTone(status: string): StatusBadgeTone {
  if (status === 'ok') return 'success'
  if (status === 'warn') return 'warning'
  return 'danger' // crit | error
}

function statusLabel(status: string): string {
  if (status === 'ok') return 'OK'
  if (status === 'warn') return 'Warnung'
  if (status === 'crit') return 'Kritisch'
  return 'Fehler'
}

function relativZeit(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 2) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  const h = Math.floor(min / 60)
  if (h < 24) return `vor ${h} Std.`
  const d = Math.floor(h / 24)
  return `vor ${d} Tag${d !== 1 ? 'en' : ''}`
}

const CATEGORY_LABEL: Record<string, string> = {
  funnel: 'Funnel',
  cron: 'Cron-Jobs',
  sends: 'Sendungen',
  config: 'Konfiguration',
}

export default async function PipelineHealthPage() {
  // Admin-Guard (gleicher Aufbau wie admin/makler/page.tsx und admin/sachverstaendige/page.tsx)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: p } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (p?.rolle !== 'admin') redirect('/login?error=Nur+Admins')

  // Letzten 7 Tage holen, absteigend nach run_at — JS-Dedup: erste Zeile pro check_id = neueste
  const admin = createAdminClient()
  const { data: runs } = await admin
    .from('health_check_runs')
    .select('id, check_id, category, status, metric, detail, sample_ids, alerted_at, run_at')
    .gte('run_at', new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString())
    .order('run_at', { ascending: false })

  const rows = (runs ?? []) as HealthRun[]

  // Deduplizieren: erste Zeile je check_id = neueste
  const seen = new Set<string>()
  const latest: HealthRun[] = []
  for (const r of rows) {
    if (!seen.has(r.check_id)) {
      seen.add(r.check_id)
      latest.push(r)
    }
  }

  // Letzter Lauf-Zeitstempel (über alle Checks)
  const maxRunAt = latest.length > 0
    ? latest.reduce((max, r) => (r.run_at > max ? r.run_at : max), latest[0].run_at)
    : null

  // Gruppierung nach category
  const byCategory = new Map<string, HealthRun[]>()
  for (const r of latest) {
    const cat = r.category ?? 'config'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(r)
  }

  const categoryOrder = ['funnel', 'cron', 'sends', 'config']

  return (
    <div className="py-8 px-2 max-w-4xl mx-auto space-y-6">
      {/* Titel + letzter Lauf-Zeitstempel */}
      <PageHeader
        title="Pipeline-Health"
        description={
          maxRunAt ? (
            <>
              Letzter Lauf:{' '}
              <span className="font-semibold text-claimondo-navy">{relativZeit(maxRunAt)}</span>
              {' '}({new Date(maxRunAt).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' })})
            </>
          ) : (
            'Noch kein Lauf registriert.'
          )
        }
        size="lg"
      />

      {/* Leerzustand */}
      {latest.length === 0 && (
        <EmptyState
          icon={ActivityIcon}
          title="Noch keine Health-Läufe"
          description="Der stündliche Cron /api/cron/pipeline-health hat noch keine Daten geschrieben."
        />
      )}

      {/* Kategorien */}
      {categoryOrder.map((cat) => {
        const checks = byCategory.get(cat)
        if (!checks || checks.length === 0) return null
        return (
          <SectionCard
            key={cat}
            title={CATEGORY_LABEL[cat] ?? cat}
          >
            <div className="divide-y divide-claimondo-border">
              {checks.map((r) => (
                <div key={r.check_id} className="py-3 flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-4">
                  {/* Status-Badge + Check-ID */}
                  <div className="flex items-center gap-2 min-w-[180px]">
                    <StatusBadge tone={statusTone(r.status)} size="xs">
                      {statusLabel(r.status)}
                    </StatusBadge>
                    <span className="text-caption font-mono text-claimondo-ondo">{r.check_id}</span>
                  </div>

                  {/* Detail + Metric + Zeitstempel */}
                  <div className="flex-1 min-w-0 space-y-0.5">
                    <p className="text-body-sm text-claimondo-navy leading-snug">{r.detail || '—'}</p>
                    {r.metric != null && (
                      <p className="text-caption text-claimondo-ondo">
                        Metrik: <span className="font-semibold">{r.metric}</span>
                      </p>
                    )}
                    {r.sample_ids && Array.isArray(r.sample_ids) && r.sample_ids.length > 0 && (
                      <p className="text-caption text-claimondo-ondo font-mono truncate">
                        Beispiel-IDs: {r.sample_ids.slice(0, 5).join(', ')}
                      </p>
                    )}
                  </div>

                  {/* Zeitstempel */}
                  <div className="text-caption text-claimondo-ondo/70 shrink-0 pt-0.5">
                    {relativZeit(r.run_at)}
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
        )
      })}
    </div>
  )
}
