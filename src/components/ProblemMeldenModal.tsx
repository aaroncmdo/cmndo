'use client'

import { useState } from 'react'
import { XIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

const KATEGORIEN = [
  { value: 'seite-laedt-nicht', label: 'Seite lädt nicht' },
  { value: 'upload-fehler', label: 'Upload funktioniert nicht' },
  { value: 'anzeige-fehler', label: 'Anzeige-Fehler' },
  { value: 'login-problem', label: 'Login-Problem' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

export default function ProblemMeldenModal({ fallId, onClose }: { fallId?: string; onClose: () => void }) {
  const [kategorie, setKategorie] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)

  async function handleSubmit() {
    if (!kategorie || beschreibung.length < 10) return
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }

    await supabase.from('technische_probleme').insert({
      user_id: user.id,
      fall_id: fallId ?? null,
      kategorie,
      beschreibung,
      browser: typeof navigator !== 'undefined' ? navigator.userAgent.slice(0, 200) : null,
      aktuelle_url: typeof window !== 'undefined' ? window.location.href : null,
    })
    setDone(true)
    setSaving(false)
  }

  if (done) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
        <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
        <div className="relative bg-white rounded-xl shadow-xl max-w-sm w-full mx-4 p-6 text-center" onClick={e => e.stopPropagation()}>
          <p className="text-2xl mb-2">✅</p>
          <p className="text-gray-900 font-semibold">Vielen Dank!</p>
          <p className="text-gray-500 text-sm mt-1">Wir kümmern uns darum.</p>
          <button onClick={onClose} className="mt-4 bg-[#1E3A5F] hover:bg-[#4573A2] text-white text-sm font-medium px-6 py-2 rounded-lg">OK</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-xl max-w-md w-full mx-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-gray-900">Technisches Problem melden</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><XIcon className="w-5 h-5" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Kategorie</label>
            <select value={kategorie} onChange={e => setKategorie(e.target.value)}
              className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg px-3 py-2">
              <option value="">Bitte wählen...</option>
              {KATEGORIEN.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Was ist passiert? (min. 10 Zeichen)</label>
            <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} rows={3}
              placeholder="Beschreiben Sie das Problem..."
              className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg px-3 py-2 placeholder-gray-400 resize-none" />
          </div>
          <button onClick={handleSubmit} disabled={saving || !kategorie || beschreibung.length < 10}
            className="w-full bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
            {saving ? 'Wird gesendet...' : 'Problem melden'}
          </button>
        </div>
      </div>
    </div>
  )
}
