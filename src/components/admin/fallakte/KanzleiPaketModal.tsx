'use client'

// AAR-539 (C2): Kanzlei-Paket-Reader-Modal.
// Ein Dialog der je nach aktueller Phase die passenden Paket-Typen zeigt,
// ein Feldset rendert, optional einen File-Upload akzeptiert und beim
// Submit die Server-Action applyKanzleiPaket() aufruft.
// Rechnet computed-Felder (z.B. frist_bis = datum + 14d) live im Client aus.

import { useMemo, useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  getPaketeForPhase,
  findPaketById,
  type PaketTyp,
  type FieldDef,
} from '@/lib/fall/kanzlei-paket-config'
import { applyKanzleiPaket } from '@/app/faelle/[id]/actions/kanzlei-paket'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type FormValues = Record<string, string | number | boolean | null>

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  fallId: string
  phase: number
  subphase: string
}

export function KanzleiPaketModal({ open, onOpenChange, fallId, phase, subphase }: Props) {
  const pakete = useMemo(() => getPaketeForPhase(phase), [phase])
  const [paketId, setPaketId] = useState<string>(pakete[0]?.id ?? '')
  const [values, setValues] = useState<FormValues>({})
  const [file, setFile] = useState<File | null>(null)
  const [pending, startTransition] = useTransition()

  const paket = useMemo(() => findPaketById(paketId), [paketId])

  function handlePaketChange(id: string) {
    setPaketId(id)
    setValues({})
    setFile(null)
  }

  function handleFieldChange(name: string, value: string | number | boolean | null) {
    setValues((prev) => ({ ...prev, [name]: value }))
  }

  function resolveComputed(field: FieldDef): string {
    if (field.type !== 'computed' || !field.computed) return ''
    const out = field.computed(values)
    return typeof out === 'string' ? out : out == null ? '' : String(out)
  }

  async function handleSubmit() {
    if (!paket) {
      toast.error('Bitte einen Paket-Typ auswählen')
      return
    }

    // Client-seitige Pflicht-Validierung
    for (const field of paket.fields) {
      if (field.type === 'computed') continue
      if (field.required) {
        const v = values[field.name]
        if (v === undefined || v === null || v === '') {
          toast.error(`Pflichtfeld „${field.label}" fehlt`)
          return
        }
      }
    }

    startTransition(async () => {
      const fd = new FormData()
      fd.append('fall_id', fallId)
      fd.append('paket_id', paket.id)
      fd.append('values', JSON.stringify(values))
      if (paket.file_upload && file) fd.append('file', file)

      const result = await applyKanzleiPaket(fd)
      if (result.success) {
        toast.success(`Paket „${paket.label}" eingelesen`)
        onOpenChange(false)
        setValues({})
        setFile(null)
      } else {
        toast.error(result.error ?? 'Paket-Import fehlgeschlagen')
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#0D1B3E]">Kanzlei-Paket einlesen</DialogTitle>
          <DialogDescription>
            Aktuelle Phase {phase} · {subphase}. Wählen Sie das Paket aus, das von der Kanzlei eingegangen ist.
          </DialogDescription>
        </DialogHeader>

        {pakete.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Für die aktuelle Phase sind keine Kanzlei-Pakete definiert. Nutze den Endpoint-Register-Panel
            im Kanzlei-E-Akte-Tab.
          </div>
        ) : (
          <>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-[#0D1B3E]">Paket-Typ</label>
              <select
                value={paketId}
                onChange={(e) => handlePaketChange(e.target.value)}
                className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
              >
                {pakete.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
              {paket && (
                <p className="text-xs text-gray-500">
                  Routet zu Endpoint <code className="font-mono">{paket.endpoint_event}</code> ·{' '}
                  {paket.subphase_from} → {paket.subphase_to}
                </p>
              )}
            </div>

            {paket && (
              <>
                <div className="space-y-3">
                  {paket.fields.map((field) => (
                    <FieldRow
                      key={field.name}
                      field={field}
                      value={values[field.name] ?? ''}
                      computed={field.type === 'computed' ? resolveComputed(field) : ''}
                      onChange={(v) => handleFieldChange(field.name, v)}
                    />
                  ))}
                </div>

                {paket.file_upload && (
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-[#0D1B3E]">
                      {paket.file_upload.label}
                    </label>
                    <input
                      type="file"
                      accept="application/pdf,image/*"
                      onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#EBF1F8] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[#0D1B3E] hover:file:bg-[#d9e5f2]"
                    />
                    <p className="text-xs text-gray-500">
                      Wird im Bucket <code className="font-mono">fall-dokumente</code> unter{' '}
                      <code className="font-mono">kanzlei-pakete/{fallId.slice(0, 8)}/…</code> abgelegt.
                    </p>
                  </div>
                )}

                <div className="rounded-md border border-[#EBF1F8] bg-[#f8f9fb] p-3">
                  <p className="text-xs font-medium text-[#0D1B3E] mb-1.5">Side-Effects (Vorschau)</p>
                  <ul className="list-disc ml-4 space-y-0.5 text-xs text-gray-700">
                    {paket.side_effects.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </div>
              </>
            )}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            disabled={pending}
            className="text-sm rounded-md border border-gray-200 bg-white px-3 py-1.5 hover:bg-gray-50 disabled:opacity-50"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending || !paket}
            className="text-sm rounded-md bg-[#0D1B3E] text-white px-3 py-1.5 hover:bg-[#162857] disabled:opacity-50"
          >
            {pending ? 'Wird eingelesen …' : 'Paket speichern'}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function FieldRow({
  field,
  value,
  computed,
  onChange,
}: {
  field: FieldDef
  value: string | number | boolean | null
  computed: string
  onChange: (v: string | number | boolean | null) => void
}) {
  const baseLabel = (
    <label className="text-xs font-medium text-[#0D1B3E]">
      {field.label}
      {field.required && <span className="text-red-600 ml-0.5">*</span>}
    </label>
  )

  if (field.type === 'computed') {
    return (
      <div className="space-y-1.5">
        {baseLabel}
        <div className="w-full rounded-md border border-gray-200 bg-[#f8f9fb] px-3 py-2 text-sm text-gray-600 font-mono">
          {computed || '—'}
        </div>
        {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
      </div>
    )
  }

  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1.5">
        {baseLabel}
        <select
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
        >
          <option value="">– bitte wählen –</option>
          {field.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
      </div>
    )
  }

  if (field.type === 'textarea') {
    return (
      <div className="space-y-1.5">
        {baseLabel}
        <textarea
          value={typeof value === 'string' ? value : ''}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder}
          rows={3}
          className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
        />
        {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
      </div>
    )
  }

  const inputType =
    field.type === 'date'
      ? 'date'
      : field.type === 'datetime'
        ? 'datetime-local'
        : field.type === 'number' || field.type === 'currency'
          ? 'number'
          : 'text'

  return (
    <div className="space-y-1.5">
      {baseLabel}
      <input
        type={inputType}
        value={typeof value === 'string' || typeof value === 'number' ? value : ''}
        step={field.type === 'currency' ? '0.01' : undefined}
        onChange={(e) => {
          const v = e.target.value
          if (field.type === 'number' || field.type === 'currency') {
            onChange(v === '' ? null : Number(v))
          } else {
            onChange(v)
          }
        }}
        placeholder={field.placeholder}
        className="w-full rounded-md border border-gray-200 bg-white px-3 py-2 text-sm focus:border-[#4573A2] focus:outline-none"
      />
      {field.hint && <p className="text-xs text-gray-500">{field.hint}</p>}
    </div>
  )
}
