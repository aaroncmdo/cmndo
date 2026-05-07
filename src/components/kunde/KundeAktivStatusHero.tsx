// 2026-05-07 Design-Review Item 5b: Kunde-Dashboard Phase B (aktiver Fall).
// Beim Single-Fall-Setup (faelle.length === 1) rendert der Hero einen
// 5-Step-Process-Visualizer mit hervorgehobener aktueller Phase + Fall-
// Nummer + Phase-Label. Drueckt das mentale Modell das wir im Empty-State-
// Hero (Item 5a) etabliert haben jetzt auf den aktiven State.
//
// Multi-Fall (≥2): Hero rendert null — User sieht direkt die Karten-Liste.

import {
  ClipboardListIcon,
  CalendarCheckIcon,
  SearchIcon,
  FileTextIcon,
  WalletIcon,
} from 'lucide-react'

const STEPS = [
  { icon: ClipboardListIcon, label: 'Schaden gemeldet' },
  { icon: CalendarCheckIcon, label: 'SV terminiert' },
  { icon: SearchIcon,        label: 'Begutachtung' },
  { icon: FileTextIcon,      label: 'Gutachten' },
  { icon: WalletIcon,        label: 'Reguliert' },
] as const

export type KundeAktivStatusHeroFall = {
  fall_nummer: string | null
  /** Termin-Start-ISO (sv_termin oder gutachter_termin) — wenn in der Zukunft, Phase 1; wenn in Vergangenheit, Phase 2+ */
  sv_termin_iso: string | null
  /** Bestaetigung des Termins. Triggert Phase 1 auch wenn sv_termin selbst noch nicht da ist. */
  gutachter_termin_bestaetigt_am: string | null
  gutachten_eingegangen_am: string | null
  regulierung_am: string | null
  abgeschlossen_am: string | null
}

function deriveStep(f: KundeAktivStatusHeroFall): number {
  if (f.regulierung_am || f.abgeschlossen_am) return 4
  if (f.gutachten_eingegangen_am) return 3
  if (f.sv_termin_iso && new Date(f.sv_termin_iso).getTime() < Date.now()) return 2
  if (f.sv_termin_iso || f.gutachter_termin_bestaetigt_am) return 1
  return 0
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' })
  } catch {
    return null
  }
}

export default function KundeAktivStatusHero({ fall }: { fall: KundeAktivStatusHeroFall }) {
  const currentStep = deriveStep(fall)
  const currentLabel = STEPS[currentStep].label
  const fallNummer = fall.fall_nummer ?? '—'

  // Naechster-Schritt-Hinweis — 1 Step vor currentStep, oder fertig.
  const nextStep = currentStep < STEPS.length - 1 ? STEPS[currentStep + 1] : null
  const terminDatum = fmtDate(fall.sv_termin_iso)

  return (
    <div className="rounded-2xl border border-claimondo-border bg-white p-5 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">
            Ihr Fall <span className="font-mono">{fallNummer}</span>
          </p>
          <h2 className="text-xl font-bold text-claimondo-navy mt-1">
            Phase {currentStep + 1}/{STEPS.length}: {currentLabel}
          </h2>
        </div>
        {terminDatum && currentStep <= 1 && (
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-wider text-claimondo-ondo">Nächster Termin</p>
            <p className="text-sm font-semibold text-claimondo-navy">{terminDatum}</p>
          </div>
        )}
      </div>

      {/* Process-Stepper */}
      <ol className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 pt-2">
        {STEPS.map((step, i) => {
          const Icon = step.icon
          const done = i < currentStep
          const active = i === currentStep
          const future = i > currentStep
          return (
            <li key={step.label} className="flex flex-col items-center text-center gap-1.5">
              <div
                className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
                  done
                    ? 'bg-emerald-500 text-white'
                    : active
                    ? 'bg-claimondo-navy text-white ring-4 ring-claimondo-navy/15'
                    : 'bg-claimondo-ondo/10 text-claimondo-ondo/60'
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span
                className={`text-[10px] uppercase tracking-wider ${
                  active ? 'text-claimondo-navy font-semibold' : 'text-claimondo-ondo'
                }`}
              >
                Schritt {i + 1}
              </span>
              <span
                className={`text-xs font-medium ${
                  future ? 'text-claimondo-ondo/60' : 'text-claimondo-navy'
                }`}
              >
                {step.label}
              </span>
            </li>
          )
        })}
      </ol>

      {/* Naechster-Schritt-Hint */}
      {nextStep && (
        <p className="text-xs text-claimondo-ondo border-t border-claimondo-border/60 pt-3">
          ⏱ Als Nächstes: <span className="text-claimondo-navy font-medium">{nextStep.label}</span>.
        </p>
      )}
      {!nextStep && (
        <p className="text-xs text-emerald-700 border-t border-claimondo-border/60 pt-3">
          ✓ Ihr Fall ist abgeschlossen.
        </p>
      )}
    </div>
  )
}
