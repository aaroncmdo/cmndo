'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLeadStatus } from '../../actions'

const STATUS_OPTIONS = [
  { value: 'neu', label: 'Neu' },
  { value: 'rueckruf', label: 'Rückruf' },
  { value: 'quali-offen', label: 'Quali offen' },
  { value: 'flow-gesendet', label: 'Flow gesendet' },
  { value: 'umgewandelt', label: 'Umgewandelt' },
  { value: 'umgewandelt-sv', label: 'Umgewandelt (SV)' },
  { value: 'disqualifiziert', label: 'Disqualifiziert' },
  { value: 'kalt', label: 'Kalt' },
] as const

const STATUS_COLOR: Record<string, string> = {
  neu: 'bg-blue-50 text-blue-300 border-blue-800',
  rueckruf: 'bg-yellow-50 text-yellow-300 border-yellow-800',
  'quali-offen': 'bg-orange-50 text-orange-300 border-orange-800',
  'flow-gesendet': 'bg-violet-50 text-violet-300 border-violet-800',
  umgewandelt: 'bg-green-50 text-green-300 border-green-800',
  'umgewandelt-sv': 'bg-emerald-50 text-emerald-300 border-emerald-800',
  disqualifiziert: 'bg-red-50 text-red-300 border-red-800',
  kalt: 'bg-gray-100 text-gray-500 border-gray-300',
}

export default function LeadDetailClient({
  lead,
}: {
  lead: { id: string; status: string }
}) {
  const router = useRouter()
  const [status, setStatus] = useState(lead.status)
  const [saving, setSaving] = useState(false)

  async function handleChange(newStatus: string) {
    setStatus(newStatus)
    setSaving(true)
    try {
      await updateLeadStatus(lead.id, newStatus)
    } catch {
      setStatus(lead.status)
    }
    setSaving(false)
    router.refresh()
  }

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 mb-5">
      <h2 className="text-sm font-medium text-gray-500 mb-3">Status</h2>
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => handleChange(e.target.value)}
          disabled={saving}
          className={`px-3 py-2 rounded-xl text-sm font-medium border cursor-pointer focus:outline-none focus:ring-1 focus:ring-zinc-600 ${STATUS_COLOR[status] ?? 'bg-gray-100 text-gray-700 border-gray-300'}`}
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {saving && <span className="text-xs text-gray-500">Speichert ...</span>}
      </div>
    </div>
  )
}
