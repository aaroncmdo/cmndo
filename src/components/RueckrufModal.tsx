'use client'

import { useState, useEffect, useRef } from 'react'

interface RueckrufModalProps {
  leadId: string
  leadName: string
  defaultDatum?: string
  defaultUhrzeit?: string
  defaultNotiz?: string
  onSave: (leadId: string, datum: string, uhrzeit: string, notiz: string) => void | Promise<void>
  onCancel: () => void
}

function getNextHour(): string {
  const now = new Date()
  const h = Math.min(now.getHours() + 1, 18)
  return `${String(h).padStart(2, '0')}:00`
}

function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const ZEITEN = Array.from({ length: 41 }, (_, i) => {
  const h = 8 + Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}).filter(t => t <= '18:00')

export default function RueckrufModal({ leadId, leadName, defaultDatum, defaultUhrzeit, defaultNotiz, onSave, onCancel }: RueckrufModalProps) {
  const [datum, setDatum] = useState(defaultDatum ?? todayStr())
  const [uhrzeit, setUhrzeit] = useState(defaultUhrzeit ?? getNextHour())
  const [notiz, setNotiz] = useState(defaultNotiz ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLSelectElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  async function handleSave() {
    setError(null)
    if (!datum || !uhrzeit) { setError('Datum und Uhrzeit sind Pflicht'); return }
    const combined = new Date(`${datum}T${uhrzeit}:00`)
    if (combined < new Date()) { setError('Termin darf nicht in der Vergangenheit liegen'); return }
    setSaving(true)
    try {
      await onSave(leadId, datum, uhrzeit, notiz)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Speichern')
      setSaving(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') onCancel()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full mx-4 p-5" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <h3 className="text-base font-semibold text-gray-900 mb-4">
          Rückruf vereinbaren
          <span className="block text-sm font-normal text-gray-500 mt-0.5">{leadName}</span>
        </h3>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Datum</label>
              <input type="date" value={datum} onChange={e => setDatum(e.target.value)} min={todayStr()}
                className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
            </div>
            <div>
              <label className="text-xs text-gray-500 font-medium block mb-1">Uhrzeit</label>
              <select ref={inputRef} value={uhrzeit} onChange={e => setUhrzeit(e.target.value)}
                className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2]">
                {ZEITEN.map(z => <option key={z} value={z}>{z}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 font-medium block mb-1">Notiz (optional)</label>
            <textarea value={notiz} onChange={e => setNotiz(e.target.value)} rows={2} placeholder="z.B. Kunde wünscht Rückruf nach 14 Uhr"
              className="w-full bg-white border border-gray-300 text-gray-800 text-sm rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4573A2] placeholder-gray-400 resize-none" />
          </div>

          {error && <p className="text-red-600 text-xs bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 bg-[#1E3A5F] hover:bg-[#4573A2] disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-lg transition-colors">
              {saving ? 'Speichert...' : 'Rückruf speichern'}
            </button>
            <button onClick={onCancel} className="px-4 py-2.5 text-gray-500 hover:text-gray-700 text-sm transition-colors">
              Abbrechen
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
