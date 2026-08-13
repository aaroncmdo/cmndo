'use client'

// AAR-162 / W2: Generische Inline-Edit-Komponente für Fall-Stammdaten.
// Adaptiert aus src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx
// (AAR-140 / W6) — gleiches UX-Pattern, aber gegen FallContext statt gegen
// eine Lead-Action. Auto-Save on-blur, Status-Dot für Feedback.

import { useState, useTransition } from 'react'
import { LoaderIcon, CheckIcon } from 'lucide-react'
import { useFall } from '../FallContext'
import { formatiereDatumEingabe, deZuIso, isoZuDe, istUnvollstaendigeEingabe } from '@/lib/format/datum-de'

type Props = {
  label: string
  fieldName: string
  value: string | number | boolean | null | undefined
  type?: 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea' | 'select'
  /** CMM-32: Bei type='select' nötig — rendert ein Dropdown statt Input. */
  options?: { value: string; label: string }[]
  placeholder?: string
  hint?: string
  transform?: (raw: string) => string
}

export default function InlineEditField({
  label,
  fieldName,
  value,
  type = 'text',
  options,
  placeholder,
  hint,
  transform,
}: Props) {
  const { canEdit, updateField } = useFall()
  const editable = canEdit(fieldName)
  const initial = value == null ? '' : String(value)
  const [draft, setDraft] = useState(initial)
  // Ops-Test #13: Ein natives <input type="date"> rendert im BROWSER-Locale — auf einem
  // englisch eingestellten System steht dort MM/DD/YYYY, und das laesst sich nicht
  // erzwingen (Chrome ignoriert `lang`). Datumsfelder in der Fallakte sind durchweg
  // ERFASSUNG (versendet am, eingegangen am) — also Vergangenheit, wo Tippen ohnehin
  // schneller ist als Blaettern. Deshalb ein Textfeld mit deutscher Maske.
  // `draft` bleibt ISO (YYYY-MM-DD): handleBlur/updateField sind unveraendert.
  const [datumAnzeige, setDatumAnzeige] = useState(() => isoZuDe(initial))
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function handleBlur() {
    if (!editable) return
    // Dieses Feld speichert AUTOMATISCH bei Blur. Bei einem Datum heisst draft='' aber
    // zweierlei: das Feld wurde geleert (loeschen ist gewollt) ODER die Eingabe ist noch
    // unvollstaendig ("15.03."). Ohne die Unterscheidung nimmt ein Klick neben das Feld
    // das gespeicherte Datum weg, waehrend der Nutzer seinen Text noch davor stehen
    // sieht — stiller Datenverlust. Die Anzeige springt stattdessen sichtbar zurueck.
    if (type === 'date' && istUnvollstaendigeEingabe(datumAnzeige)) {
      setDatumAnzeige(isoZuDe(initial))
      setDraft(initial)
      return
    }
    const final = transform ? transform(draft) : draft
    if (final === initial) return
    setStatus('saving')
    startTransition(async () => {
      const r = await updateField(fieldName, final)
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  const borderCls = !editable
    ? 'border-transparent'
    : status === 'saving'
      ? 'border-claimondo-ondo'
      : status === 'saved'
        ? 'border-success/40'
        : status === 'error'
          ? 'border-danger/40'
          : 'border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo'

  const common = {
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setDraft(e.target.value),
    onBlur: handleBlur,
    disabled: !editable,
    placeholder,
    className: `text-sm font-medium bg-transparent border-b w-full py-0.5 outline-none transition-colors disabled:cursor-default disabled:text-claimondo-navy ${borderCls}`,
  }

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
        {label}
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-success" />}
        {status === 'error' && <span className="text-danger">Fehler</span>}
        {!editable && <span className="text-[9px] text-claimondo-ondo/50 ml-auto">read-only</span>}
      </label>
      {type === 'textarea' ? (
        <textarea {...common} rows={2} />
      ) : type === 'select' && options ? (
        <select
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleBlur}
          disabled={!editable}
          className={`text-sm font-medium bg-transparent border-b w-full py-0.5 outline-none transition-colors disabled:cursor-default disabled:text-claimondo-navy ${borderCls}`}
        >
          <option value="">— bitte wählen —</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === 'date' ? (
        // value/onChange NACH dem Spread — sie ersetzen die ISO-Variante aus `common`.
        <input
          {...common}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="TT.MM.JJJJ"
          maxLength={10}
          value={datumAnzeige}
          onChange={(e) => {
            const formatiert = formatiereDatumEingabe(e.target.value)
            setDatumAnzeige(formatiert)
            // Nach aussen nur, was ein vollstaendiges Datum ergibt — sonst schriebe
            // jeder Tastendruck einen Teilstand ("15.03.") in den Fall.
            setDraft(deZuIso(formatiert) ?? '')
          }}
        />
      ) : (
        <input type={type as Exclude<Props['type'], 'select' | 'textarea'>} {...common} />
      )}
      {hint && <p className="text-[10px] text-claimondo-ondo/70">{hint}</p>}
    </div>
  )
}
