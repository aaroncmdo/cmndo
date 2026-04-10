'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { updateLeadStatus } from '../../actions'
import LeadKonvertierenModal from '@/components/leads/LeadKonvertierenModal'

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
  neu: 'bg-[#4573A2]/5 text-[#7BA3CC] border-[#1E3A5F]',
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
  lead: {
    id: string; status: string
    vorname?: string | null; nachname?: string | null
    telefon?: string | null; email?: string | null
    kennzeichen?: string | null; fahrzeug_hersteller?: string | null; fahrzeug_modell?: string | null
    schadenfall_typ?: string | null; source_channel?: string | null
  }
}) {
  const router = useRouter()
  const [status, setStatus] = useState(lead.status)
  const [saving, setSaving] = useState(false)
  const [showKonvertieren, setShowKonvertieren] = useState(false)

  async function handleChange(newStatus: string) {
    // KFZ-146: Bei Konvertierung Bestaetigungs-Modal zeigen
    if (newStatus === 'umgewandelt' || newStatus === 'umgewandelt-sv') {
      setShowKonvertieren(true)
      return
    }
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

  async function handleConvert() {
    const result = await updateLeadStatus(lead.id, 'umgewandelt') as { converted?: boolean; fallId?: string }
    return result
  }

  return (
    <>
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

      {showKonvertieren && (
        <LeadKonvertierenModal
          lead={{
            id: lead.id,
            vorname: lead.vorname ?? null,
            nachname: lead.nachname ?? null,
            telefon: lead.telefon ?? null,
            email: lead.email ?? null,
            kennzeichen: lead.kennzeichen ?? null,
            fahrzeug: [lead.fahrzeug_hersteller, lead.fahrzeug_modell].filter(Boolean).join(' ') || null,
            schadenfall_typ: lead.schadenfall_typ ?? null,
            source_channel: lead.source_channel ?? null,
          }}
          onClose={() => setShowKonvertieren(false)}
          onConvert={handleConvert}
        />
      )}
    </>
  )
}
