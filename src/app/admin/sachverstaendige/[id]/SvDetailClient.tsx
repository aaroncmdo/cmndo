'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateSvProfile } from './actions'

const PAKET_OPTIONS = [
  { value: 'standard', label: 'Standard (10 Fälle, 15km)' },
  { value: 'pro', label: 'Pro (25 Fälle, 40km)' },
  { value: 'premium', label: 'Premium (50 Fälle, 70km)' },
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

  const inputCls = 'w-full bg-white border border-gray-200 rounded-xl px-4 py-2.5 text-gray-900 text-sm placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-[#4573A2]'

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5">
      <h2 className="text-sm font-medium text-gray-500 mb-4">Profil bearbeiten</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-500 text-xs mb-1">Vorname</label>
            <input name="vorname" defaultValue={sv.vorname} className={inputCls} />
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1">Nachname</label>
            <input name="nachname" defaultValue={sv.nachname} className={inputCls} />
          </div>
        </div>

        <div>
          <label className="block text-gray-500 text-xs mb-1">Telefon</label>
          <input name="telefon" defaultValue={sv.telefon} className={inputCls} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-gray-500 text-xs mb-1">Paket</label>
            <select name="paket" defaultValue={sv.paket} className={inputCls}>
              {PAKET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-gray-500 text-xs mb-1">Max Fälle / Monat</label>
            <input name="max_faelle_monat" type="number" min="1" defaultValue={sv.maxFaelleMonat} className={inputCls} />
          </div>
        </div>

        {/* PLZ-Einsatzgebiet ENTFERNT — Dispatching per Isochrone */}

        <div>
          <label className="block text-gray-500 text-xs mb-1">Status</label>
          <select name="ist_aktiv" defaultValue={sv.istAktiv ? 'true' : 'false'} className={inputCls}>
            <option value="true">Aktiv</option>
            <option value="false">Inaktiv</option>
          </select>
        </div>

        <div>
          <label className="block text-gray-500 text-xs mb-1">Notizen</label>
          <textarea name="notizen" defaultValue={sv.notizen} rows={3} className={`${inputCls} resize-none`} placeholder="Interne Notizen ..." />
        </div>

        {error && <p className="text-red-500 text-sm">{error}</p>}
        {success && <p className="text-emerald-500 text-sm">Gespeichert!</p>}

        <button type="submit" disabled={saving}
          className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 bg-[#1E3A5F] hover:bg-[#4573A2] text-white">
          {saving ? 'Speichert ...' : 'Änderungen speichern'}
        </button>
      </form>
    </div>
  )
}
