'use client'

import { useState, useTransition } from 'react'
import { XIcon, PlusIcon } from 'lucide-react'
import { createManualTask } from '@/lib/tasks/manual-actions'

// KFZ-175: Modal zum Erstellen eines manuellen Tasks.

export default function TaskCreateModal({
  fallId,
  leadId,
  mitarbeiter,
  onClose,
  onCreated,
}: {
  fallId?: string
  leadId?: string
  mitarbeiter: { id: string; name: string; rolle: string }[]
  onClose: () => void
  onCreated?: () => void
}) {
  const [pending, startTransition] = useTransition()
  const [titel, setTitel] = useState('')
  const [beschreibung, setBeschreibung] = useState('')
  const [zugewiesenAn, setZugewiesenAn] = useState('')
  const [faelligAm, setFaelligAm] = useState('')
  const [prioritaet, setPrioritaet] = useState('normal')
  const [error, setError] = useState<string | null>(null)

  function handleSubmit() {
    if (!titel.trim() || !zugewiesenAn) { setError('Titel und Empfänger sind Pflicht'); return }
    setError(null)
    startTransition(async () => {
      const r = await createManualTask({
        titel, beschreibung, zugewiesen_an: zugewiesenAn,
        faellig_am: faelligAm || undefined,
        prioritaet, fall_id: fallId, lead_id: leadId,
      })
      if (r.success) { onCreated?.(); onClose() }
      else setError(r.error ?? 'Fehler')
    })
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <PlusIcon className="w-4 h-4 text-[#4573A2]" /> Task erstellen
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1"><XIcon className="w-4 h-4" /></button>
        </div>
        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Titel *</label>
            <input value={titel} onChange={e => setTitel(e.target.value)} placeholder="Was muss getan werden?"
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Beschreibung</label>
            <textarea value={beschreibung} onChange={e => setBeschreibung(e.target.value)} rows={2}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Zuweisen an *</label>
              <select value={zugewiesenAn} onChange={e => setZugewiesenAn(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]">
                <option value="">Wählen...</option>
                {mitarbeiter.map(m => <option key={m.id} value={m.id}>{m.name} ({m.rolle})</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Priorität</label>
              <select value={prioritaet} onChange={e => setPrioritaet(e.target.value)}
                className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]">
                <option value="niedrig">Niedrig</option>
                <option value="normal">Normal</option>
                <option value="hoch">Hoch</option>
                <option value="dringend">Dringend</option>
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Fällig am</label>
            <input type="date" value={faelligAm} onChange={e => setFaelligAm(e.target.value)}
              className="w-full bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-[#4573A2]" />
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-2">
          <button onClick={onClose} disabled={pending} className="flex-1 py-2 rounded-xl text-sm text-gray-600 bg-gray-100 hover:bg-gray-200">Abbrechen</button>
          <button onClick={handleSubmit} disabled={pending} className="flex-1 py-2 rounded-xl text-sm font-semibold text-white bg-[#4573A2] hover:bg-[#1E3A5F] disabled:opacity-50">
            {pending ? 'Erstellt...' : 'Erstellen'}
          </button>
        </div>
      </div>
    </div>
  )
}
