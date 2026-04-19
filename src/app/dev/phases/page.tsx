// AAR-565 (B2): Playground — zeigt alle 4 Rollen × 4 Varianten × 3 Mock-Fälle.
// Admin-only, nicht in Sidebar verlinkt — direkter Aufruf via /dev/phases.

import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { PhasePipeline } from '@/components/shared/fall-phases'
import type { PhaseStepData, PhaseVariant, Rolle } from '@/components/shared/fall-phases'

const PHASE_NAMES = [
  'Ersterfassung',
  'Onboarding',
  'Disposition',
  'Gutachter-Termin',
  'Gutachten',
  'Kanzlei-Paket',
  'VS-Reaktion',
  'Klage',
  'Regulierung',
  'Auszahlung',
]

function buildPhases(aktuelle: number, opts?: { blocked?: number; skipped?: number[] }): PhaseStepData[] {
  return PHASE_NAMES.map((name, idx) => {
    const phase = idx + 1
    let state: PhaseStepData['state'] = 'upcoming'
    if (opts?.skipped?.includes(phase)) state = 'skipped'
    else if (opts?.blocked === phase) state = 'blocked'
    else if (phase < aktuelle) state = 'done'
    else if (phase === aktuelle) state = 'active'

    const subphases =
      phase === aktuelle
        ? [
            { id: `${phase}.1`, label: 'Trigger erfasst', state: 'done' as const, visible: true, reachedAt: '2026-04-18T09:00:00Z' },
            { id: `${phase}.2`, label: 'Bestätigung ausstehend', state: 'active' as const, visible: true },
            { id: `${phase}.3`, label: 'Übergabe vorbereitet', state: 'upcoming' as const, visible: true },
          ]
        : phase < aktuelle
          ? [
              { id: `${phase}.1`, label: 'Trigger erfasst', state: 'done' as const, visible: true, reachedAt: '2026-04-17T10:00:00Z' },
              { id: `${phase}.2`, label: 'Abgeschlossen', state: 'done' as const, visible: true, reachedAt: '2026-04-17T14:00:00Z' },
            ]
          : undefined

    return {
      phase,
      name,
      state,
      reachedAt: state === 'done' || state === 'active' ? `2026-04-${17 + Math.min(phase, 2)}T12:00:00Z` : undefined,
      reachedBy: state === 'done' ? 'System' : undefined,
      subphases,
      blockReason: state === 'blocked' ? 'VS antwortet nicht — Eskalation Tag 14 läuft' : undefined,
    }
  })
}

const MOCK_FAELLE: { id: string; titel: string; phases: PhaseStepData[] }[] = [
  { id: 'mock-frueh', titel: 'Früh (Phase 2 aktiv)', phases: buildPhases(2) },
  { id: 'mock-mitte', titel: 'Mittig mit Block (Phase 7 blockiert)', phases: buildPhases(6, { blocked: 7 }) },
  { id: 'mock-spaet', titel: 'Spät (Phase 9 aktiv, Klage übersprungen)', phases: buildPhases(9, { skipped: [8] }) },
]

const ROLLEN: Rolle[] = ['admin', 'kb', 'sv', 'kunde']
const VARIANTEN: PhaseVariant[] = ['horizontal', 'vertical', 'compact', 'timeline']

export default async function DevPhasesPage() {
  if (process.env.NODE_ENV === 'production') notFound()

  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) redirect('/login')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') redirect('/login')

  return (
    <main className="min-h-screen bg-claimondo-bg p-6 space-y-8">
      <header className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-claimondo-navy">
          Phase-Component-Library — Playground (AAR-565)
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Alle 4 Rollen × 4 Varianten × 3 Mock-Fälle. Nur Dev-Env.
        </p>
      </header>

      {MOCK_FAELLE.map((mock) => (
        <section key={mock.id} className="max-w-5xl mx-auto space-y-4">
          <h2 className="text-sm font-semibold text-claimondo-navy">{mock.titel}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ROLLEN.flatMap((rolle) =>
              VARIANTEN.map((variant) => (
                <article
                  key={`${rolle}-${variant}-${mock.id}`}
                  className="bg-claimondo-card border border-claimondo-border rounded-xl p-4 shadow-[var(--shadow-claimondo-sm)]"
                >
                  <header className="flex items-center justify-between mb-3 pb-2 border-b border-claimondo-border">
                    <span className="text-[11px] uppercase tracking-wider text-gray-400">
                      {rolle} · {variant}
                    </span>
                  </header>
                  <PhasePipeline
                    fall={{ id: mock.id, aktuelle_phase: null }}
                    rolle={rolle}
                    phases={mock.phases}
                    variant={variant}
                    showTimestamps
                  />
                </article>
              )),
            )}
          </div>
        </section>
      ))}
    </main>
  )
}
