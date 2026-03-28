import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'

// ─── Status pipeline for the progress bar ────────────────────────────────────

const STATUS_STEPS = [
  { key: 'ersterfassung', label: 'Erfasst' },
  { key: 'sv-zugewiesen', label: 'Gutachter' },
  { key: 'gutachten-eingegangen', label: 'Gutachten' },
  { key: 'kanzlei-uebergeben', label: 'Kanzlei' },
  { key: 'regulierung', label: 'Regulierung' },
  { key: 'abgeschlossen', label: 'Abgeschlossen' },
]

// Intermediate statuses map to a pipeline step
const STATUS_TO_STEP: Record<string, string> = {
  ersterfassung: 'ersterfassung',
  'sv-zugewiesen': 'sv-zugewiesen',
  'sv-termin': 'sv-zugewiesen',
  'gutachten-eingegangen': 'gutachten-eingegangen',
  filmcheck: 'gutachten-eingegangen',
  'kanzlei-uebergeben': 'kanzlei-uebergeben',
  anschlussschreiben: 'kanzlei-uebergeben',
  regulierung: 'regulierung',
  abgeschlossen: 'abgeschlossen',
  storniert: 'storniert',
}

const URSACHE_LABEL: Record<string, string> = {
  wasserschaden: 'Wasserschaden',
  sachbeschaedigung: 'Sachbeschädigung',
  brand: 'Brand',
  einbruch: 'Einbruch',
  sturmschaden: 'Sturmschaden',
  vandalismus: 'Vandalismus',
  verschleiss: 'Verschleiß',
  sonstiges: 'Sonstiges',
}

function getStepIndex(status: string): number {
  const mapped = STATUS_TO_STEP[status] ?? status
  const idx = STATUS_STEPS.findIndex(s => s.key === mapped)
  return idx >= 0 ? idx : 0
}

export default async function KundeDashboard() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  // Find leads matching this user's email
  const { data: leads } = await supabase
    .from('leads')
    .select('id')
    .eq('email', user!.email!)

  const leadIds = (leads ?? []).map(l => l.id)

  // Fetch faelle for these leads
  const { data: faelle } = leadIds.length
    ? await supabase
        .from('faelle')
        .select('id, fall_nummer, status, schadens_ursache, schadens_ort, created_at')
        .in('lead_id', leadIds)
        .order('created_at', { ascending: false })
    : { data: [] }

  return (
    <div className="px-4 py-8">
      <div className="max-w-3xl mx-auto">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-white mb-1">Meine Fälle</h1>
          <p className="text-zinc-500 text-sm">
            {faelle?.length
              ? `${faelle.length} ${faelle.length === 1 ? 'Fall' : 'Fälle'}`
              : 'Übersicht Ihrer Schadensfälle'}
          </p>
        </div>

        {!faelle?.length ? (
          <div className="bg-zinc-900 rounded-2xl p-12 text-center border border-zinc-800">
            <div className="text-zinc-600 text-4xl mb-4">📋</div>
            <h3 className="text-white font-medium mb-1">Noch keine Fälle</h3>
            <p className="text-zinc-500 text-sm">
              Sobald ein Schadensfall für Sie angelegt wird, erscheint er hier.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {faelle.map(fall => {
              const currentStep = getStepIndex(fall.status)
              const isStorniert = fall.status === 'storniert'

              return (
                <Link
                  key={fall.id}
                  href={`/kunde/fall/${fall.id}`}
                  className="block bg-zinc-900 rounded-2xl p-5 border border-zinc-800 hover:border-zinc-600 transition-colors group"
                >
                  {/* Top row: Fallnummer + Schadensart */}
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <span className="text-blue-400 font-mono text-xs group-hover:text-blue-300 transition-colors">
                        {fall.fall_nummer ?? fall.id.slice(0, 8)}
                      </span>
                      <p className="text-white font-medium text-sm mt-0.5">
                        {URSACHE_LABEL[fall.schadens_ursache ?? ''] ?? 'Schadensfall'}
                      </p>
                    </div>
                    <div className="text-right shrink-0 ml-4">
                      {fall.schadens_ort && (
                        <p className="text-zinc-500 text-xs">{fall.schadens_ort}</p>
                      )}
                      <p className="text-zinc-600 text-xs mt-0.5">
                        {new Date(fall.created_at).toLocaleDateString('de-DE', {
                          day: '2-digit', month: '2-digit', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  {isStorniert ? (
                    <div className="flex items-center gap-2 mt-2">
                      <div className="flex-1 h-1.5 rounded-full bg-red-950" />
                      <span className="text-red-400 text-xs font-medium">Storniert</span>
                    </div>
                  ) : (
                    <div>
                      {/* Step dots + line */}
                      <div className="flex items-center gap-0 mt-1">
                        {STATUS_STEPS.map((step, i) => {
                          const reached = i <= currentStep
                          const isCurrent = i === currentStep
                          return (
                            <div key={step.key} className="flex items-center flex-1 last:flex-none">
                              {/* Dot */}
                              <div
                                className={`w-3 h-3 rounded-full shrink-0 border-2 transition-colors ${
                                  isCurrent
                                    ? 'border-blue-500 bg-blue-500'
                                    : reached
                                    ? 'border-blue-500/60 bg-blue-500/60'
                                    : 'border-zinc-700 bg-zinc-800'
                                }`}
                              />
                              {/* Line (not after last) */}
                              {i < STATUS_STEPS.length - 1 && (
                                <div
                                  className={`flex-1 h-0.5 mx-1 rounded-full ${
                                    i < currentStep ? 'bg-blue-500/60' : 'bg-zinc-800'
                                  }`}
                                />
                              )}
                            </div>
                          )
                        })}
                      </div>
                      {/* Labels */}
                      <div className="flex mt-1.5">
                        {STATUS_STEPS.map((step, i) => {
                          const isCurrent = i === currentStep
                          return (
                            <div key={step.key} className={`flex-1 last:flex-none ${i === STATUS_STEPS.length - 1 ? 'text-right' : ''}`}>
                              <span className={`text-[10px] leading-tight ${
                                isCurrent ? 'text-blue-400 font-medium' : i <= currentStep ? 'text-zinc-500' : 'text-zinc-700'
                              }`}>
                                {step.label}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </Link>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
