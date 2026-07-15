'use client'

// Wizard-Schritt 2: Fahrzeug. Hersteller (freier Text + Datalist-Vorschläge) · Fahrzeugtyp
// (Button-Gruppe, Default PKW) · gewerblich/privat · Modell (optional). Speist Marke + Fahrzeugklasse
// in die Engine (via wizard-logic).
import { FAHRZEUGTYP_OPTIONEN, HAEUFIGE_HERSTELLER, type Fahrzeugtyp } from './wizard-logic'

type Props = {
  hersteller: string
  fahrzeugtyp: Fahrzeugtyp
  gewerbe: boolean
  modell: string
  onChange: (patch: Partial<{ hersteller: string; fahrzeugtyp: Fahrzeugtyp; gewerbe: boolean; modell: string }>) => void
}

export function FahrzeugStep({ hersteller, fahrzeugtyp, gewerbe, modell, onChange }: Props) {
  return (
    <div className="flex flex-col gap-3">
      <div>
        <h3 className="text-body font-bold text-claimondo-navy">Ihr Fahrzeug</h3>
        <p className="mt-0.5 text-[0.8125rem] text-claimondo-shield/80">
          Damit wir die passende Werkstatt (Marke &amp; Fahrzeugtyp) finden.
        </p>
      </div>

      <label className="block">
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Hersteller
        </span>
        <input
          list="werkstatt-hersteller-liste"
          value={hersteller}
          onChange={(e) => onChange({ hersteller: e.target.value })}
          placeholder="z. B. BMW"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
        <datalist id="werkstatt-hersteller-liste">
          {HAEUFIGE_HERSTELLER.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
      </label>

      <div>
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Fahrzeugtyp
        </span>
        <div className="flex flex-wrap gap-2">
          {FAHRZEUGTYP_OPTIONEN.map((opt) => {
            const aktiv = opt.wert === fahrzeugtyp
            return (
              <button
                key={opt.wert}
                type="button"
                onClick={() => onChange({ fahrzeugtyp: opt.wert })}
                className={`rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
                  aktiv
                    ? 'border-claimondo-ondo bg-claimondo-ondo text-white'
                    : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
                }`}
              >
                {opt.label}
              </button>
            )
          })}
        </div>
      </div>

      <div>
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Nutzung
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onChange({ gewerbe: false })}
            className={`flex-1 rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
              !gewerbe ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
            }`}
          >
            Privat
          </button>
          <button
            type="button"
            onClick={() => onChange({ gewerbe: true })}
            className={`flex-1 rounded-ios-md border px-3 py-2 text-body-sm font-semibold transition-colors ${
              gewerbe ? 'border-claimondo-ondo bg-claimondo-ondo text-white' : 'border-claimondo-border bg-white text-claimondo-navy hover:border-claimondo-ondo'
            }`}
          >
            Gewerblich
          </button>
        </div>
      </div>

      <label className="block">
        <span className="mb-1 block text-[0.6875rem] font-bold uppercase tracking-wide text-claimondo-shield/70">
          Modell <span className="font-normal normal-case text-claimondo-shield/50">(optional)</span>
        </span>
        <input
          value={modell}
          onChange={(e) => onChange({ modell: e.target.value })}
          placeholder="z. B. 3er, Golf …"
          className="w-full rounded-ios-md border border-claimondo-border bg-white px-4 py-2.5 text-body-sm text-claimondo-navy placeholder-claimondo-shield/50 focus:border-claimondo-ondo focus:outline-none"
        />
      </label>
    </div>
  )
}
