'use client'

// AAR-270 / P2d-3 (dispatch-config-unify): Wochentag-Präferenz für den
// SV-Slot-Filter (leads.wunschtermin_wochentage, ISO 1=Mo..7=So). Kontrollierter,
// presentational Picker — der Consumer besitzt value + onChange (Persistenz),
// damit Phase 2 (patchLead + saveStammdaten + router.refresh fürs SV-Matching)
// und das flache v2-Sektion-Panel (saveStammdaten) denselben Picker nutzen, ohne
// dass die geteilte Komponente an eine Save-Strategie gebunden ist.
// Mehrfachauswahl, leeres Array = „Egal".

const WOCHENTAGE = [
  { iso: 1, label: 'Mo' },
  { iso: 2, label: 'Di' },
  { iso: 3, label: 'Mi' },
  { iso: 4, label: 'Do' },
  { iso: 5, label: 'Fr' },
  { iso: 6, label: 'Sa' },
  { iso: 7, label: 'So' },
] as const

export function WunschterminWochentagePills({
  value,
  onChange,
  disabled,
}: {
  value: number[]
  onChange: (next: number[]) => void
  disabled?: boolean
}) {
  function toggle(iso: number) {
    onChange(value.includes(iso) ? value.filter((w) => w !== iso) : [...value, iso].sort())
  }

  return (
    <div className="space-y-2">
      <label className="text-xs uppercase tracking-[0.18em] text-claimondo-ondo font-semibold block">
        Wunschtag (optional, Mehrfachauswahl)
      </label>
      <div className="flex flex-wrap gap-2">
        {WOCHENTAGE.map((d) => {
          const sel = value.includes(d.iso)
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => toggle(d.iso)}
              disabled={disabled}
              className={`min-w-[44px] px-3.5 py-2 rounded-full text-xs font-semibold tracking-[-.005em] transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)] active:scale-[0.97] ${
                sel
                  ? 'bg-claimondo-ondo text-white shadow-cta-ondo'
                  : 'bg-claimondo-navy/[0.06] text-claimondo-navy hover:bg-claimondo-navy/[0.10]'
              } disabled:opacity-40`}
            >
              {d.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => onChange([])}
          disabled={disabled || value.length === 0}
          className={`px-3.5 py-2 rounded-full text-xs font-semibold tracking-[-.005em] transition-all duration-200 ${
            value.length === 0
              ? 'bg-claimondo-navy text-white shadow-[0_4px_12px_rgba(13,27,62,.20)]'
              : 'bg-white text-claimondo-shield border border-claimondo-navy/[0.10] hover:border-claimondo-ondo hover:text-claimondo-navy'
          } disabled:opacity-40`}
          title="Alle Wochentage zurücksetzen"
        >
          Egal
        </button>
      </div>
    </div>
  )
}
