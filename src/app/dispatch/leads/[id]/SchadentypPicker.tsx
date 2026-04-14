'use client'

import { useState, useTransition } from 'react'
import { saveSchadentyp } from './actions'
import { InfoIcon, AlertTriangleIcon } from 'lucide-react'

type Schadentyp = 'spurwechsel' | 'auffahrunfall' | 'vorfahrtsverletzung' | 'parkplatz' | 'sonstiges'

const OPTIONS: { value: Schadentyp; label: string; hinweis: string }[] = [
  { value: 'spurwechsel', label: 'Spurwechsel', hinweis: 'Zeugen aktiv abfragen, Dashcam ansprechen, Polizei-AZ wertvoll.' },
  { value: 'auffahrunfall', label: 'Auffahrunfall', hinweis: 'Personenschaden aktiv ansprechen (Schleudertrauma).' },
  { value: 'vorfahrtsverletzung', label: 'Vorfahrtsverletzung', hinweis: 'Polizeibericht Pflicht. Zeugen dringend.' },
  { value: 'parkplatz', label: 'Parkplatz', hinweis: 'Fahrerflucht-Rate hoch. Kennzeichen sofort, Kamera-Check.' },
  { value: 'sonstiges', label: 'Sonstiges', hinweis: 'Freitext Pflicht für Kanzlei.' },
]

export default function SchadentypPicker({ leadId, initialTyp, initialFreitext }: {
  leadId: string
  initialTyp?: Schadentyp | null
  initialFreitext?: string | null
}) {
  const [typ, setTyp] = useState<Schadentyp | null>(initialTyp ?? null)
  const [freitext, setFreitext] = useState(initialFreitext ?? '')
  const [pending, startTransition] = useTransition()
  const [toast, setToast] = useState('')

  const selected = OPTIONS.find(o => o.value === typ)

  function save() {
    if (!typ) return
    if (typ === 'sonstiges' && !freitext.trim()) {
      setToast('Freitext bei "Sonstiges" ist Pflicht')
      setTimeout(() => setToast(''), 2500)
      return
    }
    startTransition(async () => {
      const r = await saveSchadentyp(leadId, typ, typ === 'sonstiges' ? freitext : null)
      setToast(r.success ? 'Gespeichert' : (r.error ?? 'Fehler'))
      setTimeout(() => setToast(''), 2500)
    })
  }

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-700">Schadentyp</h3>
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map(o => (
          <button
            key={o.value}
            type="button"
            onClick={() => setTyp(o.value)}
            className={`px-3 py-2 rounded-lg text-xs font-medium text-left transition-colors ${
              typ === o.value ? 'bg-[#0D1B3E] text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {selected && (
        <div className={`flex items-start gap-2 px-3 py-2 rounded-lg text-xs ${
          selected.value === 'parkplatz' || selected.value === 'sonstiges'
            ? 'bg-amber-50 text-amber-800 border border-amber-200'
            : 'bg-blue-50 text-blue-800 border border-blue-200'
        }`}>
          {selected.value === 'parkplatz' ? <AlertTriangleIcon className="w-4 h-4 shrink-0 mt-0.5" /> : <InfoIcon className="w-4 h-4 shrink-0 mt-0.5" />}
          <span><strong>Hinweis MA:</strong> {selected.hinweis}</span>
        </div>
      )}

      {typ === 'sonstiges' && (
        <textarea
          value={freitext}
          onChange={e => setFreitext(e.target.value)}
          placeholder="Beschreibung (Pflicht)..."
          className="w-full px-3 py-2 border border-gray-200 rounded-lg text-xs h-20 resize-none"
        />
      )}

      {toast && <p className={`text-xs ${toast === 'Gespeichert' ? 'text-green-700' : 'text-red-700'}`}>{toast}</p>}

      <button
        disabled={pending || !typ}
        onClick={save}
        className="w-full px-3 py-2 rounded-lg bg-[#4573A2] text-white text-xs font-medium hover:bg-[#3a6290] disabled:opacity-50"
      >
        {pending ? '...' : 'Schadentyp speichern'}
      </button>
    </div>
  )
}
