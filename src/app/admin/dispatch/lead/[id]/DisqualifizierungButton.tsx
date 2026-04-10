'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { disqualifiziereLead } from './actions'
import { XCircleIcon, XIcon } from 'lucide-react'

const GRUENDE = [
  { value: 'eigenverschulden', label: 'Kein Gegner - Eigenverschulden' },
  { value: 'eigenschaden', label: 'Selbstverschulden' },
  { value: 'bagatelle', label: 'Bagatellschaden unter Gutachten-Schwelle' },
  { value: 'kunde-will-nicht', label: 'Kunde möchte nicht fortfahren' },
  { value: 'falsche-angaben', label: 'Falsche oder unvollständige Angaben' },
  { value: 'doppelt', label: 'Doppelter Lead bereits vorhanden' },
  { value: 'sonstiges', label: 'Sonstiges' },
]

export default function DisqualifizierungButton({ leadId }: { leadId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [grund, setGrund] = useState('')
  const [notiz, setNotiz] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    if (!grund) return
    setSaving(true)
    try {
      await disqualifiziereLead(leadId, grund, notiz || null)
      setOpen(false)
      router.refresh()
    } catch {
      // keep open
    }
    setSaving(false)
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-red-400 border border-red-800/50 hover:bg-red-50/50 transition-colors"
      >
        <XCircleIcon className="w-3.5 h-3.5" />
        Disqualifizieren
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-white border border-gray-200 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Lead disqualifizieren</h3>
              <button onClick={() => setOpen(false)} className="text-gray-500 hover:text-gray-800">
                <XIcon className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Grund *</label>
                <select
                  value={grund}
                  onChange={e => setGrund(e.target.value)}
                  className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-red-500"
                >
                  <option value="">Bitte wählen...</option>
                  {GRUENDE.map(g => (
                    <option key={g.value} value={g.value}>{g.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Notiz (optional)</label>
                <textarea
                  value={notiz}
                  onChange={e => setNotiz(e.target.value)}
                  placeholder="Zusaetzliche Informationen..."
                  rows={3}
                  className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-red-500 placeholder-gray-400 resize-y"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={saving || !grund}
                  className="flex-1 bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white text-sm font-medium py-2.5 rounded-xl transition-colors"
                >
                  {saving ? 'Wird disqualifiziert...' : 'Disqualifizieren bestaetigen'}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="px-4 py-2.5 text-gray-500 hover:text-gray-800 text-sm rounded-xl transition-colors"
                >
                  Abbrechen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
