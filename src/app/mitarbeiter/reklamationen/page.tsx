// AAR-68: Mitarbeiter Reklamationen — KB-Redesign 07/2026 (mobile-first Row-Liste;
// Datenschicht 1:1: KB-Faelle -> reklamationen).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import PageHeader from '@/components/shared/PageHeader'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterReklamationen() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  const { data: faelle } = await supabase.from('v_claim_full').select('fall_id, claim_nummer, kennzeichen').eq('kundenbetreuer_id', user.id)
  const fallIds = (faelle ?? []).map((f) => f.fall_id as string)
  const fallMap = new Map((faelle ?? []).map((f) => [f.fall_id as string, f]))

  const { data: reklamationen } = fallIds.length > 0
    ? await supabase
        .from('reklamationen')
        .select('id, fall_id, grund, begruendung, status, eingereicht_am, frist_bis, bearbeitet_am')
        .in('fall_id', fallIds)
        .order('eingereicht_am', { ascending: false })
    : { data: [] }
  const list = reklamationen ?? []

  return (
    <div className="space-y-5">
      <PageHeader title="Reklamationen" description="Reklamationen zu Ihren Fällen, neueste zuerst." size="lg" />

      <div className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
        {list.length === 0 ? (
          <p className="px-4 py-16 text-center text-body-sm text-claimondo-ondo/70">Keine Reklamationen</p>
        ) : (
          <div className="divide-y divide-claimondo-border">
            {list.map((r) => {
              const fall = fallMap.get(r.fall_id as string)
              return (
                <Link
                  key={r.id}
                  href={`/faelle/${r.fall_id}`}
                  className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-claimondo-bg sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-body-sm font-medium text-claimondo-navy">
                      {fall?.claim_nummer ?? (r.fall_id as string).slice(0, 8)}
                    </p>
                    <p className="truncate text-body-xs text-claimondo-ondo">{r.grund ?? '—'}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2.5 py-0.5 text-body-xs font-medium',
                        r.status === 'offen'
                          ? 'bg-warning-soft text-warning-strong'
                          : r.status === 'erledigt'
                            ? 'bg-success-soft text-success-strong'
                            : 'bg-claimondo-bg text-claimondo-ondo',
                      )}
                    >
                      {r.status ?? '—'}
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-body-xs tabular-nums text-claimondo-ondo/70">
                      {r.eingereicht_am ? new Date(r.eingereicht_am as string).toLocaleDateString('de-DE') : '—'}
                      {r.frist_bis ? ` · Frist ${new Date(r.frist_bis as string).toLocaleDateString('de-DE')}` : ''}
                    </span>
                  </div>
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
