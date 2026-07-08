// AAR-68: Mitarbeiter Faelle-Liste — KB-Redesign 07/2026 (mobile-first Row-Liste
// statt scroll-Tabelle; Datenschicht 1:1 erhalten).
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import FallPhaseBadge from '@/components/shared/FallPhaseBadge'

export const dynamic = 'force-dynamic'

export default async function MitarbeiterFaelle() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')

  // CMM-47 B-Rest: faelle → v_claim_full. CMM-49 T1.2-d: Status = sub_phase (v_claim_phase).
  const { data: faelle } = await supabase
    .from('v_claim_full')
    .select('fall_id, claim_nummer, sub_phase, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, fall_created_at, sa_unterschrieben')
    .eq('kundenbetreuer_id', user.id)
    .order('fall_created_at', { ascending: false })

  const list = faelle ?? []

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-heading-lg font-bold text-claimondo-navy">Meine Fälle</h1>
        <p className="mt-0.5 text-body-sm text-claimondo-ondo">
          {list.length} {list.length === 1 ? 'zugewiesener Fall' : 'zugewiesene Fälle'}, neueste zuerst
        </p>
      </div>

      <div className="overflow-hidden rounded-ios-md border border-claimondo-border bg-white">
        {list.length === 0 ? (
          <p className="px-4 py-16 text-center text-body-sm text-claimondo-ondo/70">Keine Fälle zugewiesen</p>
        ) : (
          <div className="divide-y divide-claimondo-border">
            {list.map((f) => {
              const fahrzeug = [f.fahrzeug_hersteller, f.fahrzeug_modell].filter(Boolean).join(' ')
              const meta = [f.kennzeichen, fahrzeug].filter(Boolean).join(' · ') || '—'
              return (
                <Link
                  key={f.fall_id as string}
                  href={`/faelle/${f.fall_id}`}
                  className="flex flex-col gap-2 px-4 py-3.5 transition-colors hover:bg-claimondo-bg sm:flex-row sm:items-center sm:gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-mono text-body-sm font-medium text-claimondo-navy">
                      {f.claim_nummer ?? (f.fall_id as string).slice(0, 8)}
                    </p>
                    <p className="truncate text-body-xs text-claimondo-ondo">{meta}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 sm:justify-end sm:gap-4">
                    <FallPhaseBadge subPhase={f.sub_phase} size="sm" className="shrink-0" />
                    <span className="shrink-0 whitespace-nowrap text-body-xs tabular-nums text-claimondo-ondo/70">
                      {f.fall_created_at ? new Date(f.fall_created_at as string).toLocaleDateString('de-DE') : '—'}
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
