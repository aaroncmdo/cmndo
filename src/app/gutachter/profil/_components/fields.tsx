'use client'

// 2026-05-06 SV7 (Form-Audit): drei Verbesserungen pro Form-Row:
//   1) Mobile-Stack: flex-col auf <sm, flex-row ab sm — Label nimmt nicht
//      mehr 144px vom 390px-Mobile-Viewport, Input bekommt full-width.
//   2) Implicit-Label: <label> wrapt Input — keine htmlFor/id-Plumbing,
//      Klick aufs Label fokussiert das Feld.
//   3) Auto-inferred autoComplete + inputMode aus type-Prop:
//      type=tel   → inputMode=tel,    autoComplete=tel
//      type=email → inputMode=email,  autoComplete=email
//      type=number→ inputMode=decimal
//      Mobile-Tastatur springt damit auf die richtige Variante (Ziffern-
//      Pad bei Telefon, @-Tastatur bei Email).

export const ROW_WRAPPER_CLS =
  'flex flex-col sm:flex-row gap-1 sm:gap-2 py-2 border-b border-claimondo-border/50'
export const ROW_LABEL_CLS = 'text-claimondo-ondo text-sm sm:w-36 sm:shrink-0 sm:pt-2'
export const ROW_INPUT_CLS =
  'flex-1 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy placeholder-claimondo-ondo/60 focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]'

export function FieldRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col sm:flex-row gap-1 sm:gap-2 py-2.5 border-b border-claimondo-border/50 last:border-0">
      <span className="text-claimondo-ondo text-sm sm:w-36 sm:shrink-0">{label}</span>
      <span className="text-claimondo-navy text-sm">{value}</span>
    </div>
  )
}

// BUG-91: Controlled-Variante fuer den neuen Profil-Form. Zustand wird im
// Parent gehalten (form-State) damit die Server Action saubere Werte
// bekommt — keine FormData-Sammlung mehr.
export function ControlledRow({ label, value, onChange, type = 'text', placeholder }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string
}) {
  return (
    <div className={ROW_WRAPPER_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
      />
    </div>
  )
}

export function SelectRow({ label, value, onChange, options }: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<{ value: string; label: string }>
}) {
  return (
    <div className={ROW_WRAPPER_CLS}>
      <span className={ROW_LABEL_CLS}>{label}</span>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="flex-1 bg-claimondo-bg border border-claimondo-border rounded-ios-lg px-3 py-2 text-sm text-claimondo-navy focus:outline-none focus:ring-2 focus:ring-[var(--brand-primary)]"
      >
        {options.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
