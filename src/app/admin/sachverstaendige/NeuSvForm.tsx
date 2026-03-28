'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createSachverstaendiger } from './actions'

const PAKET_OPTIONS = [
  { value: 'starter-10', label: 'Starter (10)' },
  { value: 'standard-25', label: 'Standard (25)' },
  { value: 'premium-50', label: 'Premium (50)' },
]

export default function NeuSvForm() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{ id: string; tempPassword: string } | null>(null)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const data = new FormData(e.currentTarget)
      const res = await createSachverstaendiger(data)
      setResult(res)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Erstellen')
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors"
      >
        + Neuer Sachverständiger
      </button>
    )
  }

  if (result) {
    return (
      <div className="bg-zinc-900 rounded-2xl p-6 border border-green-900 mb-6">
        <h3 className="text-white font-semibold mb-3">Sachverständiger erstellt</h3>
        <div className="space-y-2 text-sm">
          <div className="flex gap-2">
            <span className="text-zinc-500 w-32 shrink-0">Temporäres Passwort:</span>
            <code className="text-green-400 bg-zinc-800 px-2 py-0.5 rounded font-mono">{result.tempPassword}</code>
          </div>
          <p className="text-zinc-500 text-xs mt-3">
            Bitte teilen Sie dem Sachverständigen das temporäre Passwort mit. Er kann es nach dem ersten Login ändern.
          </p>
        </div>
        <button
          onClick={() => { setOpen(false); setResult(null) }}
          className="mt-4 px-4 py-2 rounded-xl text-sm font-medium bg-zinc-800 text-zinc-200 hover:bg-zinc-700 transition-colors"
        >
          Schließen
        </button>
      </div>
    )
  }

  return (
    <div className="bg-zinc-900 rounded-2xl p-6 border border-zinc-800 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white font-semibold">Neuer Sachverständiger</h3>
        <button
          onClick={() => setOpen(false)}
          className="text-zinc-500 hover:text-zinc-300 text-sm transition-colors"
        >
          Abbrechen
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Vorname</label>
            <input
              name="vorname"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Max"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Nachname</label>
            <input
              name="nachname"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
              placeholder="Mustermann"
            />
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 text-sm mb-1.5">E-Mail *</label>
          <input
            name="email"
            type="email"
            required
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="sv@example.com"
          />
        </div>

        <div>
          <label className="block text-zinc-400 text-sm mb-1.5">Telefon</label>
          <input
            name="telefon"
            type="tel"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="+49 ..."
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Paket</label>
            <select
              name="paket"
              defaultValue="starter-10"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {PAKET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-zinc-400 text-sm mb-1.5">Max Fälle / Monat</label>
            <input
              name="max_faelle_monat"
              type="number"
              min="1"
              defaultValue="10"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-zinc-400 text-sm mb-1.5">Gebiet (PLZ, kommagetrennt)</label>
          <input
            name="gebiet_plz"
            className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-white text-sm placeholder-zinc-600 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="10115, 10117, 10119 ..."
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          {submitting ? 'Wird erstellt ...' : 'Sachverständiger anlegen'}
        </button>
      </form>
    </div>
  )
}
