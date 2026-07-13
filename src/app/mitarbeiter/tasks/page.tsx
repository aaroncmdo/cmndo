// AAR-68: Mitarbeiter Tasks-Liste — KB-Redesign 07/2026 (Status-Filter erhalten,
// mobile-first Row-Liste; Datenschicht 1:1).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { KiExecuteButton } from '@/components/shared/KiExecuteButton'
import { isExecutorEnabled } from '@/lib/task-executor/policy'

export const dynamic = 'force-dynamic'

const TABS = [
  { key: 'offen', label: 'Offen' },
  { key: 'in-bearbeitung', label: 'In Bearbeitung' },
  { key: 'erledigt', label: 'Erledigt' },
  { key: 'alle', label: 'Alle' },
]

export default async function MitarbeiterTasks({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { status = 'offen' } = await searchParams

  // Dashboard-Audit (29.06.): eigene ODER unassigned KB-Broadcast-Tasks.
  let query = supabase
    .from('tasks')
    .select('id, titel, beschreibung, fall_id, status, prioritaet, faellig_am, created_at, claim_id, typ')
    .or(`zugewiesen_an.eq.${user.id},and(empfaenger_rolle.eq.kundenbetreuer,zugewiesen_an.is.null)`)
    .order('faellig_am', { ascending: true, nullsFirst: false })
  if (status !== 'alle') query = query.eq('status', status)
  const { data: tasks } = await query
  const list = tasks ?? []

  const executorEnabled = isExecutorEnabled()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Meine Tasks</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">Ihnen zugewiesene Aufgaben und offene KB-Team-Aufgaben.</p>
      </div>

      {/* Status-Filter */}
      <div className="flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/mitarbeiter/tasks?status=${t.key}`}
            className={cn(
              'rounded-full px-3.5 py-1.5 text-body-xs font-medium transition-colors',
              status === t.key
                ? 'bg-claimondo-navy text-white'
                : 'border border-claimondo-border bg-white text-claimondo-ondo hover:bg-claimondo-bg',
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
        {list.length === 0 ? (
          <p className="px-4 py-16 text-center text-body-sm text-claimondo-ondo/70">Keine Tasks in dieser Kategorie</p>
        ) : (
          <div className="divide-y divide-claimondo-border">
            {list.map((t) => (
              <div key={t.id} className="flex items-center gap-2">
                <Link
                  href={t.fall_id ? `/faelle/${t.fall_id}` : '#'}
                  className="flex flex-1 items-start justify-between gap-3 px-4 py-3.5 transition-colors hover:bg-claimondo-bg"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          'shrink-0 rounded px-1.5 py-0.5 text-caption font-bold',
                          t.prioritaet === 'kritisch'
                            ? 'bg-danger-soft text-danger-strong'
                            : t.prioritaet === 'dringend'
                              ? 'bg-warning-soft text-warning-strong'
                              : 'bg-claimondo-bg text-claimondo-ondo',
                        )}
                      >
                        {t.prioritaet}
                      </span>
                      <p className="truncate text-body-sm font-medium text-claimondo-navy">{t.titel}</p>
                    </div>
                    {t.beschreibung ? <p className="mt-1 line-clamp-2 text-body-xs text-claimondo-ondo">{t.beschreibung}</p> : null}
                  </div>
                  <span className="shrink-0 whitespace-nowrap tabular-nums text-body-xs text-claimondo-ondo/70">
                    {t.faellig_am ? new Date(t.faellig_am as string).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
                  </span>
                </Link>
                <div className="pr-4 shrink-0">
                  <KiExecuteButton
                    compact
                    task={{ id: t.id, typ: t.typ ?? null, claim_id: t.claim_id ?? null, status: t.status }}
                    executorEnabled={executorEnabled}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
