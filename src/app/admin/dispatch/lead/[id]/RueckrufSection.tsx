'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveRueckruf, markRueckrufErledigt } from './actions'
import { PhoneCallIcon, CheckCircle2Icon } from 'lucide-react'

export default function RueckrufSection({
  lead,
}: {
  lead: {
    id: string
    rueckruf_datum: string | null
    rueckruf_notiz: string | null
    rueckruf_erledigt: boolean | null
  }
}) {
  const router = useRouter()
  const [datum, setDatum] = useState(lead.rueckruf_datum?.slice(0, 16) ?? '')
  const [notiz, setNotiz] = useState(lead.rueckruf_notiz ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const isErledigt = lead.rueckruf_erledigt ?? false
  const hasDatum = !!lead.rueckruf_datum
  const inPast = hasDatum && new Date(lead.rueckruf_datum!) < new Date()

  async function handleSave() {
    setSaving(true)
    try {
      await saveRueckruf(lead.id, datum ? new Date(datum).toISOString() : null, notiz || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch { /* */ }
    setSaving(false)
  }

  async function handleErledigt() {
    setSaving(true)
    try {
      await markRueckrufErledigt(lead.id)
      router.refresh()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-4">
        <PhoneCallIcon className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-medium text-zinc-400">Rückruftermin</h2>
        {isErledigt && (
          <span className="ml-auto bg-emerald-950 text-emerald-400 text-xs px-2 py-0.5 rounded-full">Erledigt</span>
        )}
        {!isErledigt && hasDatum && inPast && (
          <span className="ml-auto bg-red-950 text-red-400 text-xs font-semibold px-2 py-0.5 rounded-full">ÜBERFÄLLIG</span>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Datum & Uhrzeit</label>
          <input
            type="datetime-local"
            value={datum}
            onChange={e => setDatum(e.target.value)}
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="text-xs text-zinc-500 mb-1 block">Notiz</label>
          <input
            type="text"
            value={notiz}
            onChange={e => setNotiz(e.target.value)}
            placeholder="z.B. Kunde ab 14 Uhr erreichbar"
            className="w-full bg-zinc-800 border border-zinc-700 text-zinc-200 text-sm rounded-xl px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-zinc-600"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
        >
          {saving ? 'Speichert ...' : 'Termin speichern'}
        </button>

        {hasDatum && !isErledigt && (
          <button
            onClick={handleErledigt}
            disabled={saving}
            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-sm font-medium rounded-xl px-4 py-2 transition-colors"
          >
            <CheckCircle2Icon className="w-3.5 h-3.5" />
            Rückruf erledigt
          </button>
        )}

        {saved && <span className="text-emerald-400 text-xs">Gespeichert</span>}
      </div>
    </div>
  )
}
