'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { XIcon, CheckIcon, SparklesIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { Modal } from '@/components/primitives/Modal'

// KFZ-172 Follow-up: Auto-Fill Modal fuer OCR-extrahierte Daten.
// Zeigt die erkannten Felder mit Checkboxen, User kann einzeln
// annehmen/ablehnen/korrigieren. Submit updatet faelle-Stammdaten.

// Mapping: OCR-Feld -> faelle-Spalte
const FIELD_MAP: Record<string, { label: string; column: string }> = {
  fin: { label: 'FIN / VIN', column: 'fin' },
  kennzeichen: { label: 'Kennzeichen', column: 'kennzeichen' },
  // AAR-548 D7: halter_name ist GENERATED (vorname + nachname) — OCR mappt
  // jetzt direkt auf die Einzelfelder. `halter`/`versicherter` werden als
  // Nachname interpretiert (ohne sicheren Split); User kann im Modal korrigieren.
  halter: { label: 'Halter', column: 'halter_nachname' },
  erstzulassung: { label: 'Erstzulassung', column: 'erstzulassung' },
  hersteller: { label: 'Hersteller', column: 'fahrzeug_hersteller' },
  modell: { label: 'Modell', column: 'fahrzeug_modell' },
  versicherer: { label: 'Versicherer', column: 'gegner_versicherung' },
  vsnummer: { label: 'VS-Nummer', column: 'gegner_versicherungsnummer' },
  versicherter: { label: 'Versicherter', column: 'halter_nachname' },
  vorname: { label: 'Vorname', column: 'halter_vorname' },
  nachname: { label: 'Nachname', column: 'halter_nachname' },
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
      <Modal open onClose={onClose} maxWidth={384} ariaLabel="OCR-Auto-Fill">
        <p className="text-sm text-claimondo-ondo">Keine Daten erkannt.</p>
        <button onClick={onClose} className="mt-3 text-xs text-claimondo-ondo">Schließen</button>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} noPadding hideCloseButton maxWidth={448} ariaLabel="OCR-Auto-Fill">
      <div className="p-5 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-claimondo-ondo" />
            Daten aus {dokumentTyp} übernehmen?
          </h3>
          <button onClick={onClose} className="text-claimondo-ondo/70 hover:text-claimondo-ondo p-1">
            <XIcon className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-2">
          {fields.map(([key, value]) => {
            const mapping = FIELD_MAP[key]
            if (!mapping) return null
            const checked = selectedFields[key] ?? false
            return (
              <div key={key} className={`flex items-start gap-2.5 px-3 py-2 rounded-ios-lg border transition-colors ${
                checked ? 'border-claimondo-ondo/30 bg-claimondo-ondo/5' : 'border-claimondo-border bg-claimondo-bg/50'
              }`}>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={e => setSelectedFields(prev => ({ ...prev, [key]: e.target.checked }))}
                  disabled={!mapping.column}
                  className="mt-1 rounded border-claimondo-border text-claimondo-ondo focus:ring-claimondo-ondo"
                />
                <div className="flex-1 min-w-0">
                  <label className="text-[10px] text-claimondo-ondo uppercase tracking-wide">{mapping.label}</label>
                  <input
                    type="text"
                    value={editedValues[key] ?? value}
                    onChange={e => setEditedValues(prev => ({ ...prev, [key]: e.target.value }))}
                    disabled={!mapping.column}
                    className="w-full text-sm text-claimondo-navy bg-transparent border-none p-0 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} disabled={saving}
            className="flex-1 py-2 rounded-ios-lg text-sm text-claimondo-ondo bg-claimondo-bg hover:bg-claimondo-border transition-colors">
            Abbrechen
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2 rounded-ios-lg text-sm font-semibold text-white bg-claimondo-ondo hover:bg-claimondo-shield transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5">
            <CheckIcon className="w-3.5 h-3.5" />
            {saving ? 'Wird gespeichert...' : 'Übernehmen'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
