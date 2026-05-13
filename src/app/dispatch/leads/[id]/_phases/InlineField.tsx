'use client'

// AAR-frontend-konsolidierung-p2 (P2-T4.7): Extrahiert aus Phase4Stammdaten.tsx,
// damit der schema-getriebene LeadSchemaFields-Renderer dieselbe Komponente
// nutzen kann. Verhalten identisch zur Original-Variante (auto-save on-blur via
// saveStammdaten). Erweitert um die Typen 'number', 'textarea' und 'select' —
// diese werden vom Schema gebraucht (z.B. hat_vorschaeden=select Ja/Nein,
// vorschaeden_beschreibung=textarea, ist_fahrzeughalter=select Ja/Nein).

import { useEffect, useState, useTransition } from 'react'
import { LoaderIcon, CheckIcon } from 'lucide-react'
import { saveStammdaten } from '../actions'

export type InlineFieldType =
  | 'text'
  | 'email'
  | 'tel'
  | 'date'
  | 'time'
  | 'number'
  | 'textarea'
  | 'select'

/**
 * Generische Inline-Feld-Komponente mit auto-save on-blur.
 * Speichert nur wenn sich der Wert geändert hat. Zeigt Spinner während Save
 * und Haken direkt nach erfolgreichem Save (2s).
 */
export default function InlineField({
  label,
  value,
  fieldName,
  leadId,
  type = 'text',
  placeholder,
  transform,
  hint,
  required,
  options,
}: {
  label: string
  value: string | number | null | undefined
  fieldName: string
  leadId: string
  type?: InlineFieldType
  placeholder?: string
  transform?: (raw: string) => string
  hint?: string
  // AAR-181 Audit-Fix #3: Pflichtfeld-Markierung als dedicated Prop statt
  // hartcodiert im Label-String (sonst verliert die Markierung den Kontext
  // bei Label-Änderung).
  required?: boolean
  // Bei type='select' nötig (Schema-Renderer für Ja/Nein-Felder).
  options?: { value: string; label: string }[]
}) {
  const initial = value === null || value === undefined ? '' : String(value)
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  // AAR-unfallfotos Sync-Fix: InlineField's lokaler Draft blieb bisher auf
  // seinem Initial-Wert hängen — wenn der Server die Row ändert (z. B.
  // Haiku-Vision befüllt sachschaden_beschreibung nach Foto-Upload) und
  // router.refresh() ein neues `value`-Prop liefert, müssen wir den Draft
  // nachziehen, solange der MA nicht gerade aktiv tippt.
  useEffect(() => {
    if (status !== 'idle') return
    const incoming = value === null || value === undefined ? '' : String(value)
    setDraft((prev) => (prev === incoming ? prev : incoming))
  }, [value, status])

  function commit(rawDraft: string) {
    const final = transform ? transform(rawDraft) : rawDraft
    // AAR-223: Draft auf den transformierten Wert setzen, damit der MA nach
    // dem Blur die formatierte Variante sieht (z.B. „K AB 1234" → „K-AB 1234")
    // statt seinem Roh-Input. Auch wenn keine DB-Änderung nötig ist, müssen
    // wir hier den Draft normalisieren — sonst bleibt die Anzeige asymmetrisch
    // zur DB.
    if (transform && final !== rawDraft) {
      setDraft(final)
    }
    if (final === initial) return
    // type='number': leerer String → null, sonst Number-Cast für DB-Spalte.
    // type='select' mit 'Ja'/'Nein'-Options: Schema-Boolean-Felder
    // (hat_vorschaeden, ist_fahrzeughalter, zeugen) sind in der DB BOOLEAN
    // — hier zentral mappen, damit der LeadSchemaFields-Renderer keine
    // Sonder-Logik braucht.
    let payload: unknown
    if (type === 'number') {
      payload = final === '' ? null : Number(final)
    } else if (type === 'select' && (final === 'Ja' || final === 'Nein')) {
      payload = final === 'Ja'
    } else {
      payload = final === '' ? null : final
    }
    setStatus('saving')
    startTransition(async () => {
      const r = await saveStammdaten(leadId, { [fieldName]: payload })
      if (r.success) {
        setStatus('saved')
        setTimeout(() => setStatus('idle'), 2000)
      } else {
        setStatus('error')
        setTimeout(() => setStatus('idle'), 3000)
      }
    })
  }

  const inputClasses = `text-sm font-medium bg-transparent border-b w-full py-0.5 outline-none transition-colors ${
    status === 'saving'
      ? 'border-claimondo-ondo'
      : status === 'saved'
        ? 'border-green-300'
        : status === 'error'
          ? 'border-red-300'
          : 'border-claimondo-border hover:border-claimondo-border focus:border-claimondo-ondo'
  }`

  return (
    <div className="space-y-0.5">
      <label className="text-[10px] text-claimondo-ondo/70 uppercase tracking-wider flex items-center gap-1">
        {label}
        {required && <span className="text-red-500" aria-label="Pflichtfeld">*</span>}
        {status === 'saving' && <LoaderIcon className="w-3 h-3 text-claimondo-ondo animate-spin" />}
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
        {status === 'error' && <span className="text-red-500">Fehler</span>}
      </label>
      {type === 'textarea' ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          placeholder={placeholder}
          rows={3}
          className={inputClasses}
        />
      ) : type === 'select' ? (
        <select
          value={draft}
          onChange={(e) => {
            // Select committed direkt on-change, damit kein Blur-Workaround nötig ist
            setDraft(e.target.value)
            commit(e.target.value)
          }}
          className={inputClasses}
        >
          <option value="">—</option>
          {(options ?? []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          placeholder={placeholder}
          className={inputClasses}
        />
      )}
      {hint && <p className="text-[10px] text-claimondo-ondo/70">{hint}</p>}
    </div>
  )
}
