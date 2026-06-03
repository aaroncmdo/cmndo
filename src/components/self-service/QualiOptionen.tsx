'use client'

// AAR-956 §3a: Geteilte Quali-Optionen (Schuldfrage-Buttons). Präsentational +
// aktionsfrei — von /anfrage (SelbstQualiClient) UND /flow (incomplete-Pfad)
// genutzt, damit der Schuldfrage-Step nicht doppelt gepflegt wird (Phase C
// deprecatet /anfrage). Auswahl-Logik + Persistenz liegt beim Consumer.

export const QUALI_OPTIONEN: { value: string; label: string; hint: string }[] = [
  { value: 'gegner', label: 'Der Unfallgegner', hint: 'Die Gegenseite hat den Schaden verursacht.' },
  { value: 'unklar', label: 'Noch unklar', hint: 'Die Schuldfrage ist noch nicht eindeutig geklärt.' },
  { value: 'eigenverantwortung', label: 'Ich selbst', hint: 'Ich habe den Unfall selbst verursacht.' },
]

export function QualiOptionen({
  vorname,
  disabled,
  onWaehle,
}: {
  vorname: string | null
  disabled: boolean
  onWaehle: (value: string) => void
}) {
  return (
    <div className="max-w-md w-full">
      {vorname && <p className="text-claimondo-navy/60 text-sm mb-1 text-center">Hallo {vorname},</p>}
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-2 text-center">
        Wer hat den Unfall verursacht?
      </h1>
      <p className="text-claimondo-navy/60 text-sm mb-6 text-center">
        Das hilft uns einzuschätzen, ob wir Ihren Schaden für Sie regulieren können.
      </p>
      <div className="flex flex-col gap-3">
        {QUALI_OPTIONEN.map((opt) => (
          <button
            key={opt.value}
            type="button"
            data-testid={`quali-schuldfrage-${opt.value}`}
            disabled={disabled}
            onClick={() => onWaehle(opt.value)}
            className="w-full text-left rounded-ios-xl border border-claimondo-border bg-white px-5 py-4 transition hover:border-claimondo-ondo disabled:opacity-50"
          >
            <span className="block font-semibold text-claimondo-navy">{opt.label}</span>
            <span className="block text-sm text-claimondo-navy/60">{opt.hint}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
