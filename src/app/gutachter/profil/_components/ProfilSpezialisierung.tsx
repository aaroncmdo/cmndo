'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SectionCard } from '@/components/shared/SectionCard'
import { QUALIFIKATIONEN, SPEZIFIKATIONEN, SCHADENARTEN } from '@/app/admin/sachverstaendige/anlegen/constants'

// KFZ-154: Spezialisierungs-Section — aus ProfilClient extrahiert (Task 2).
// 3 Listen (Qualifikationen / Spezifikationen / Schadenarten) mit Toggle-Tags,
// die sofort gegen die DB schreiben.

function SpezSection({
  svId, column, title, hint, options, initial,
}: {
  svId: string
  column: 'qualifikationen_neu' | 'spezifikationen' | 'schadenarten'
  title: string
  hint: string
  options: ReadonlyArray<string>
  initial: string[]
}) {
  const [values, setValues] = useState<string[]>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()

  async function toggle(value: string) {
    const next = values.includes(value) ? values.filter(v => v !== value) : [...values, value]
    setValues(next)
    setSaving(true)
    setError(null)
    try {
      const supabase = createClient()
      const update: Record<string, string[]> = { [column]: next }
      const { error: updErr } = await supabase
        .from('sachverstaendige')
        .update(update)
        .eq('id', svId)
      if (updErr) {
        setError(updErr.message)
        setValues(values) // rollback UI
      } else {
        router.refresh()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium text-claimondo-navy">{title}</h3>
        <span className="text-[10px] text-claimondo-ondo/70">
          {values.length} gewählt{saving ? ' · speichert...' : ''}
        </span>
      </div>
      <p className="text-xs text-claimondo-ondo mb-2">{hint}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map(opt => {
          const active = values.includes(opt)
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              disabled={saving}
              className={`px-3 py-1.5 rounded-ios-lg text-xs font-medium transition-colors disabled:opacity-60 ${
                active
                  ? 'bg-[var(--brand-secondary)] text-white'
                  : 'bg-claimondo-bg text-claimondo-ondo hover:text-claimondo-navy'
              }`}
            >
              {opt}
            </button>
          )
        })}
      </div>
      {error && <p className="text-xs text-danger mt-2">{error}</p>}
    </div>
  )
}

export function ProfilSpezialisierung({
  svId,
  qualifikationen,
  spezifikationen,
  schadenarten,
}: {
  svId: string
  qualifikationen: string[]
  spezifikationen: string[]
  schadenarten: string[]
}) {
  return (
    <SectionCard className="p-6 mt-5">
      <h2 className="text-sm font-medium text-claimondo-ondo mb-1">Spezialisierungen</h2>
      <p className="text-xs text-claimondo-ondo/70 mb-4">
        Wir nutzen diese Angaben um Ihnen passende Fälle zuzuordnen. Änderungen werden sofort gespeichert.
      </p>
      <div className="space-y-5">
        <SpezSection
          svId={svId}
          column="qualifikationen_neu"
          title="Qualifikationen"
          hint="Was bieten Sie fachlich an?"
          options={QUALIFIKATIONEN}
          initial={qualifikationen}
        />
        <SpezSection
          svId={svId}
          column="spezifikationen"
          title="Spezifikationen"
          hint="Auf welche Fahrzeug-Arten sind Sie spezialisiert?"
          options={SPEZIFIKATIONEN}
          initial={spezifikationen}
        />
        <SpezSection
          svId={svId}
          column="schadenarten"
          title="Schadenarten"
          hint="Welche Schadenarten bearbeiten Sie?"
          options={SCHADENARTEN}
          initial={schadenarten}
        />
      </div>
    </SectionCard>
  )
}
