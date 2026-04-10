'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon, CheckIcon, SparklesIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

// KFZ-172 Follow-up: Auto-Fill Modal fuer OCR-extrahierte Daten.
// Zeigt die erkannten Felder mit Checkboxen, User kann einzeln
// annehmen/ablehnen/korrigieren. Submit updatet faelle-Stammdaten.

// Mapping: OCR-Feld -> faelle-Spalte
const FIELD_MAP: Record<string, { label: string; column: string }> = {
  fin: { label: 'FIN / VIN', column: 'fin' },
  kennzeichen: { label: 'Kennzeichen', column: 'kennzeichen' },
  halter: { label: 'Halter', column: 'halter_name' },
  erstzulassung: { label: 'Erstzulassung', column: 'erstzulassung' },
  hersteller: { label: 'Hersteller', column: 'fahrzeug_hersteller' },
  modell: { label: 'Modell', column: 'fahrzeug_modell' },
  versicherer: { label: 'Versicherer', column: 'gegner_versicherung' },
  vsnummer: { label: 'VS-Nummer', column: 'versicherung_schaden_nr' },
  versicherter: { label: 'Versicherter', column: 'halter_name' },
  vorname: { label: 'Vorname', column: 'halter_name' },
  nachname: { label: 'Nachname', column: 'gegner_name' },
  geburtsdatum: { label: 'Geburtsdatum', column: '' },
  klasse: { label: 'Führerschein-Klasse', column: '' },
  datum: { label: 'Unfalldatum', column: 'schadens_datum' },
  ort: { label: 'Unfallort', column: 'schadens_ort' },
}

export type OcrData = Record<string, string | null>

export default function OcrAutoFillModal({
  fallId,
  dokumentTyp,
  ocrData,
  onClose,
}: {
  fallId: string
  dokumentTyp: string
  ocrData: OcrData
  onClose: () => void
}) {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [selectedFields, setSelectedFields] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const key of Object.keys(ocrData)) {
      if (ocrData[key] && FIELD_MAP[key]?.column) initial[key] = true
    }
    return initial
  })
  const [editedValues, setEditedValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const [k, v] of Object.entries(ocrData)) {
      if (v) initial[k] = v
    }
    return initial
  })

  const fields = Object.entries(ocrData).filter(([, v]) => v != null) as [string, string][]

  async function handleSubmit() {
    setSaving(true)
    const updates: Record<string, string> = {}
    for (const [key, checked] of Object.entries(selectedFields)) {
      if (!checked) continue
      const mapping = FIELD_MAP[key]
      if (!mapping?.column) continue
      const val = editedValues[key]
      if (val) updates[mapping.column] = val
    }

    if (Object.keys(updates).length > 0) {
      const supabase = createClient()
      await supabase.from('faelle').update(updates).eq('id', fallId)
      router.refresh()
    }
    setSaving(false)
    onClose()
  }

  if (fields.length === 0) {
    return (
      <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="bg-white rounded-2xl p-6 max-w-sm w-full" onClick={e => e.stopPropagation()}>
          <p className="text-sm text-gray-500">Keine Daten erkannt.</p>
          <button onClick={onClose} className="mt-3 text-xs text-[#4573A2]">Schließen</button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-5 max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-[#4573A2]" />
            Daten aus {dokumentTyp} übernehmen?
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {fields.map(([key, value]) => {
            const mapping = FIELD_MAP[key]
            if (!mapping) return null
            const checked = selectedFields[key] ?? false
            return (
              <div key={key} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg border transition-colors ${
                checked ? 'border-[#4573A2]/30 bg-[#4573A2]/5' : 'border-gray-200 bg-gray-50/50'
              }`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setSelectedFields(prev => ({ ...prev, [key]: e.target.checked }))}
                  disabled={!mapping.column}
                  className="mt-1 rounded border-gray-300 text-[#4573A2] focus:ring-[#4573A2]"
                />
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] text-gray-500 uppercase tracking-wide">{mapping.label}</label>
                  <input
                    type="text"
                    value={editedValues[key] ?? value}
                    onChange={e => setEditedValues(prev => ({ ...prev, [key]: e.target.value }))}
                    disabled={!mapping.column}
                    className="w-full text-sm text-gray-800 bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-sm font-semibold text-white bg-[#4573A2] hover:bg-[#1E3A5F] transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5" />
            {saving ? 'Wird gespeichert...' : 'Übernehmen'}
          </button>
        </div>
      </div>
    </div>
  )
}
