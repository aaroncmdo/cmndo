'use client'

// AAR-162 / W2: Generische Inline-Edit-Komponente für Fall-Stammdaten.
// Adaptiert aus src/app/dispatch/leads/[id]/_phases/Phase4Stammdaten.tsx
// (AAR-140 / W6) — gleiches UX-Pattern, aber gegen FallContext statt gegen
// eine Lead-Action. Auto-Save on-blur, Status-Dot für Feedback.

import { useState, useTransition } from 'react'
import { LoaderIcon, CheckIcon } from 'lucide-react'
import { useFall } from '../FallContext'

type Props = {
  label: string
  fieldName: string
  value: string | number | boolean | null | undefined
  type?: 'text' | 'email' | 'tel' | 'date' | 'time' | 'number' | 'textarea'
  placeholder?: string
  hint?: string
  transform?: (raw: string) => string
}

export default function InlineEditField({
  label,
  fieldName,
  value,
  type = 'text',
  placeholder,
  hint,
  transform,
}: Props) {
  const { canEdit, updateField } = useFall()
  const editable = canEdit(fieldName)
  const initial = value == null ? '' : String(value)
  const [draft, setDraft] = useState(initial)
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [, startTransition] = useTransition()

  function handleBlur() {
    if (!editable) return
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
        ? 'border-green-300'
        : status === 'error'
          ? 'border-red-300'
          : 'border-claimondo-border hover:border-claimondo-border focus:border-[#4573A2]'

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
        {status === 'saved' && <CheckIcon className="w-3 h-3 text-green-500" />}
        {status === 'error' && <span className="text-red-500">Fehler</span>}
        {!editable && <span className="text-[9px] text-claimondo-ondo/50 ml-auto">read-only</span>}
      </label>
      {type === 'textarea' ? (
        <textarea {...common} rows={2} />
      ) : (
        <input type={type} {...common} />
      )}
      {hint && <p className="text-[10px] text-claimondo-ondo/70">{hint}</p>}
    </div>
  )
}
