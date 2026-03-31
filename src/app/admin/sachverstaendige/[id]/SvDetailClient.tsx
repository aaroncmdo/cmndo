'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateSvProfile } from './actions'

const PAKET_OPTIONS = [
  { value: 'standard', label: 'Standard (10)' },
  { value: 'pro', label: 'Pro (25)' },
  { value: 'premium', label: 'Premium (50)' },
]

type SvData = {
  id: string
  profileId: string
  vorname: string
  nachname: string
  telefon: string
  paket: string
  maxFaelleMonat: number
  istAktiv: boolean
  gebietPlz: string[]
  notizen: string
}

export default function SvDetailClient({ sv }: { sv: SvData }) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    try {
      const formData = new FormData(e.currentTarget)
      await updateSvProfile(sv.id, sv.profileId, formData)
      setSuccess(true)
      router.refresh()
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4">Profil bearbeiten</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-500 text-sm mb-1.5">Vorname</label>
            <input
              name="vorname"
              defaultValue={sv.vorname}
              className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <div>
            <label className="block text-gray-500 text-sm mb-1.5">Nachname</label>
            <input
              name="nachname"
              defaultValue={sv.nachname}
              className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-500 text-sm mb-1.5">Telefon</label>
          <input
            name="telefon"
            defaultValue={sv.telefon}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-500 text-sm mb-1.5">Paket</label>
            <select
              name="paket"
              defaultValue={sv.paket}
              className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
            >
              {PAKET_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-sm mb-1.5">Max Fälle / Monat</label>
            <input
              name="max_faelle_monat"
              type="number"
              min="1"
              defaultValue={sv.maxFaelleMonat}
              className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
        </div>

        <div>
          <label className="block text-gray-500 text-sm mb-1.5">Gebiet (PLZ, kommagetrennt)</label>
          <input
            name="gebiet_plz"
            defaultValue={sv.gebietPlz.join(', ')}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600"
            placeholder="10115, 10117, 10119 ..."
          />
        </div>

        <div>
          <label className="block text-gray-500 text-sm mb-1.5">Status</label>
          <select
            name="ist_aktiv"
            defaultValue={sv.istAktiv ? 'true' : 'false'}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-2.5 text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-blue-600"
          >
            <option value="true">Aktiv</option>
            <option value="false">Inaktiv</option>
          </select>
        </div>

        <div>
          <label className="block text-gray-500 text-sm mb-1.5">Notizen</label>
          <textarea
            name="notizen"
            defaultValue={sv.notizen}
            rows={3}
            className="w-full bg-gray-100 border border-gray-300 rounded-xl px-4 py-3 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-600 resize-none"
            placeholder="Interne Notizen ..."
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}
        {success && <p className="text-green-400 text-sm">Gespeichert!</p>}

        <button
          type="submit"
          disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed bg-blue-600 hover:bg-blue-500 text-white"
        >
          {saving ? 'Speichert ...' : 'Änderungen speichern'}
        </button>
      </form>
    </div>
  )
}
