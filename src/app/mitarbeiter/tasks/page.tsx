// AAR-68: Mitarbeiter Tasks-Liste
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterTasks({ searchParams }: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { status = 'offen' } = await searchParams

  let query = supabase
    .from('tasks')
    .select('id, titel, beschreibung, fall_id, status, prioritaet, faellig_am, created_at')
    .eq('zugewiesen_an', user.id)
    .order('faellig_am', { ascending: true, nullsFirst: false })

  if (status !== 'alle') query = query.eq('status', status)
  const { data: tasks } = await query

  const tabs: { key: string; label: string }[] = [
    { key: 'offen', label: 'Offen' },
    { key: 'in-bearbeitung', label: 'In Bearbeitung' },
    { key: 'erledigt', label: 'Erledigt' },
    { key: 'alle', label: 'Alle' },
  ]

  return (
    <div className="space-y-4">
      <PageHeader title="Meine Tasks" description="Alle Ihnen zugewiesenen Aufgaben." size="lg" />

      <div className="flex gap-2">
        {tabs.map(t => (
          <Link key={t.key} href={`/mitarbeiter/tasks?status=${t.key}`}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
              status === t.key ? 'bg-claimondo-navy text-white' : 'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-claimondo-bg'
            }`}>
            {t.label}
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-ios-lg shadow-ios-md divide-y divide-claimondo-border">
        {(tasks ?? []).map(t => (
          <Link key={t.id} href={t.fall_id ? `/faelle/${t.fall_id}` : '#'}
            className="block px-4 py-3 hover:bg-claimondo-bg transition-colors">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-claimondo-navy text-sm">{t.titel}</p>
                {t.beschreibung && <p className="text-xs text-claimondo-ondo mt-0.5 line-clamp-2">{t.beschreibung}</p>}
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                  t.prioritaet === 'kritisch' ? 'bg-red-100 text-red-700' :
                  t.prioritaet === 'dringend' ? 'bg-amber-100 text-amber-700' :
                  'bg-claimondo-bg text-claimondo-ondo'
                }`}>{t.prioritaet}</span>
                <span className="text-xs text-claimondo-ondo/70">
                  {t.faellig_am ? new Date(t.faellig_am).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) : '—'}
                </span>
              </div>
            </div>
          </Link>
        ))}
        {(!tasks || tasks.length === 0) && (
          <p className="px-4 py-12 text-center text-claimondo-ondo/70 text-sm">Keine Tasks in dieser Kategorie</p>
        )}
      </div>
    </div>
  )
}
