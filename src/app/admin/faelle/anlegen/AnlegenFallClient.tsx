'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2Icon, ArrowLeftIcon } from 'lucide-react'
import { anlegeFall, type AnlegeFallInput } from './actions'
import { SPEZIFIKATIONEN, SCHADENARTEN } from '@/app/admin/sachverstaendige/anlegen/constants'

// KFZ-154 Cleanup-Follow-up: Minimale Fall-Anlage Form fuer Admins.
// Erstellt einen Lead + Fall in einem Rutsch (analog convertLeadToFall).

export default function AnlegenFallClient() {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState<AnlegeFallInput>({
    vorname: '',
    nachname: '',
    telefon: '',
    email: '',
    kennzeichen: '',
    schadens_adresse: '',
    schadens_plz: '',
    schadens_ort: '',
    schadensursache: '',
    spezifikation: '',
    schadens_art: '',
    notiz: '',
  })
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ fall_id: string; fall_nummer: string } | null>(null)

  function update<K extends keyof AnlegeFallInput>(key: K, value: AnlegeFallInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const r = await anlegeFall({
        ...form,
        // Empty strings -> undefined, damit die Server Action sauber null setzt
        email: form.email?.trim() || undefined,
        kennzeichen: form.kennzeichen?.trim() || undefined,
        schadens_adresse: form.schadens_adresse?.trim() || undefined,
        schadens_ort: form.schadens_ort?.trim() || undefined,
        schadensursache: form.schadensursache?.trim() || undefined,
        spezifikation: form.spezifikation || undefined,
        schadens_art: form.schadens_art || undefined,
        notiz: form.notiz?.trim() || undefined,
      })
      if (r.success) {
        setResult({ fall_id: r.fall_id, fall_nummer: r.fall_nummer })
      } else {
        setError(r.error)
      }
    })
  }

  if (result) {
    return (
      <div className="px-8 py-12 max-w-2xl mx-auto">
        <div className="bg-white border border-emerald-200 rounded-2xl p-8">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center flex-shrink-0">
              <CheckCircle2Icon className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-gray-900">Fall {result.fall_nummer} angelegt</h2>
              <p className="text-sm text-gray-500 mt-1">
                {form.vorname} {form.nachname} — Schadens-PLZ {form.schadens_plz}
                {form.spezifikation && ` · ${form.spezifikation}`}
              </p>
              <div className="mt-6 flex gap-3">
                <Link
                  href={`/faelle/${result.fall_id}`}
                  target="_blank"
                  rel="noopener"
                  className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold text-center"
                >
                  Zum Fall
                </Link>
                <button
                  onClick={() => {
                    setResult(null)
                    setForm({
                      vorname: '', nachname: '', telefon: '', email: '', kennzeichen: '',
                      schadens_adresse: '', schadens_plz: '', schadens_ort: '',
                      schadensursache: '', spezifikation: '', schadens_art: '', notiz: '',
                    })
                  }}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50"
                >
                  Weiteren Fall anlegen
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="px-8 py-8 max-w-3xl mx-auto">
      <Link href="/admin/faelle" className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4">
        <ArrowLeftIcon className="w-3 h-3" /> Zurueck zu Faelle
      </Link>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Neuen Fall anlegen</h1>
      <p className="text-sm text-gray-500 mb-6">
        Direkter Eingang ohne Lead-Qualifizierung — typisch fuer telefonisch reingekommene Faelle.
      </p>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Kunde */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Kunde</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vorname *" value={form.vorname} onChange={v => update('vorname', v)} required />
            <Field label="Nachname *" value={form.nachname} onChange={v => update('nachname', v)} required />
            <Field label="Telefon *" type="tel" value={form.telefon} onChange={v => update('telefon', v)} required />
            <Field label="Email" type="email" value={form.email ?? ''} onChange={v => update('email', v)} />
          </div>
        </div>

        {/* Fahrzeug + Schadensort */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Fahrzeug + Schadensort</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Kennzeichen" value={form.kennzeichen ?? ''} onChange={v => update('kennzeichen', v)} mono />
            <Field label="Schadens-PLZ *" value={form.schadens_plz} onChange={v => update('schadens_plz', v)} required />
            <Field label="Schadens-Adresse" value={form.schadens_adresse ?? ''} onChange={v => update('schadens_adresse', v)} className="sm:col-span-2" />
            <Field label="Schadens-Ort" value={form.schadens_ort ?? ''} onChange={v => update('schadens_ort', v)} />
            <Field label="Schadensursache" value={form.schadensursache ?? ''} onChange={v => update('schadensursache', v)} placeholder="z.B. Auffahrunfall" />
          </div>
        </div>

        {/* KFZ-154: Dispatcher-relevante Klassifizierung */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Dispatcher-Klassifizierung</h2>
          <p className="text-xs text-gray-400 mb-3">
            Optional aber empfohlen — der Dispatcher matcht passende SVs ueber diese Felder.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <SelectField
              label="Spezifikation"
              value={form.spezifikation ?? ''}
              onChange={v => update('spezifikation', v)}
              options={SPEZIFIKATIONEN}
              placeholder="kein Filter"
            />
            <SelectField
              label="Schadenart"
              value={form.schadens_art ?? ''}
              onChange={v => update('schadens_art', v)}
              options={SCHADENARTEN}
              placeholder="keine Angabe"
            />
          </div>
        </div>

        {/* Notiz */}
        <div className="bg-white border border-gray-200 rounded-2xl p-5">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Interne Notiz</h2>
          <textarea
            value={form.notiz ?? ''}
            onChange={e => update('notiz', e.target.value)}
            rows={3}
            placeholder="Was hat der Kunde am Telefon gesagt?"
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-y"
          />
        </div>

        {error && (
          <div className="px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 text-red-600 text-sm">
            {error}
          </div>
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/admin/faelle')}
            disabled={pending}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50 disabled:opacity-40"
          >
            Abbrechen
          </button>
          <button
            type="submit"
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-semibold transition-colors disabled:opacity-40"
          >
            {pending ? 'Wird angelegt...' : 'Fall anlegen'}
          </button>
        </div>
      </form>
    </div>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder, className, required, mono,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  className?: string
  required?: boolean
  mono?: boolean
}) {
  return (
    <div className={className}>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        className={`w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] ${mono ? 'font-mono' : ''}`}
      />
    </div>
  )
}

function SelectField({
  label, value, onChange, options, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: ReadonlyArray<string>
  placeholder?: string
}) {
  return (
    <div>
      <label className="text-xs text-gray-500 mb-1.5 block">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full bg-gray-100 border border-gray-300 rounded-xl px-3 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      >
        <option value="">{placeholder ?? '—'}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}
