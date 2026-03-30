'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { saveLeadNotiz } from './actions'
import { StickyNoteIcon } from 'lucide-react'

export default function LeadNotizen({ leadId, notiz }: { leadId: string; notiz: string }) {
  const router = useRouter()
  const [text, setText] = useState(notiz)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  async function handleSave() {
    setSaving(true)
    try {
      await saveLeadNotiz(leadId, text || null)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      router.refresh()
    } catch { /* */ }
    setSaving(false)
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <div className="flex items-center gap-2 mb-3">
        <StickyNoteIcon className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-medium text-gray-500">Notizen</h2>
      </div>
      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        placeholder="Interne Notizen zum Lead (nur fuer Dispatch-MA sichtbar)..."
        rows={3}
        className="w-full bg-gray-100 border border-gray-300 text-gray-800 text-sm rounded-xl px-3 py-2.5 focus:outline-none focus:ring-1 focus:ring-blue-500 placeholder-gray-400 resize-y"
      />
      <div className="flex items-center gap-3 mt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-gray-900 text-sm font-medium rounded-xl px-4 py-2 transition-colors"
        >
          {saving ? 'Speichert...' : 'Notiz speichern'}
        </button>
        {saved && <span className="text-emerald-400 text-xs">Gespeichert</span>}
      </div>
    </div>
  )
}
