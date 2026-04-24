'use client'

import { useState, useTransition } from 'react'
import { waehleNachbesichtigungsTermin } from './actions'
import { CalendarIcon, CheckCircleIcon } from 'lucide-react'

type NachbesichtigungFall = {
  id: string
  fall_nummer: string | null
  nachbesichtigung_status: string | null
  nachbesichtigung_termin_datum: string | null
  nachbesichtigung_angefordert_am: string | null
}

export default function NachbesichtigungClient({ faelle }: { faelle: NachbesichtigungFall[] }) {
  const [pending, startTransition] = useTransition()
  const [selectedDate, setSelectedDate] = useState('')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const fall = faelle[0]
  if (!fall) return null

  // Mindestens morgen
  const minDate = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

  function handleSubmit() {
    if (!selectedDate) return
    startTransition(async () => {
      const result = await waehleNachbesichtigungsTermin(fall.id, selectedDate)
      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error ?? 'Fehler')
      }
    })
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border p-8 max-w-md text-center space-y-4">
          <CheckCircleIcon className="w-12 h-12 text-green-500 mx-auto" />
          <h1 className="text-lg font-semibold text-claimondo-navy">Termin gewählt</h1>
          <p className="text-sm text-claimondo-ondo">
            Ihr Nachbesichtigungstermin am {new Date(selectedDate).toLocaleDateString('de-DE')} wurde bestätigt.
            Der Gutachter der Versicherung wird sich bei Ihnen melden.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9fb] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-sm border border-claimondo-border p-8 max-w-md w-full space-y-6">
        <div className="text-center">
          <CalendarIcon className="w-10 h-10 text-[#4573A2] mx-auto mb-3" />
          <h1 className="text-lg font-semibold text-claimondo-navy">Nachbesichtigung</h1>
          <p className="text-sm text-claimondo-ondo mt-1">
            Die Versicherung hat eine erneute Besichtigung Ihres Fahrzeugs angefordert.
            Bitte wählen Sie einen Termin, an dem Ihr Fahrzeug zugänglich ist.
          </p>
        </div>

        <div className="space-y-3">
          <label className="block text-xs font-medium text-claimondo-navy">Gewünschter Termin</label>
          <input
            type="date"
            min={minDate}
            value={selectedDate}
            onChange={e => setSelectedDate(e.target.value)}
            // AAR-452: text-base (16px) verhindert iOS-Autozoom beim Fokus
            className="w-full px-4 py-3 border border-claimondo-border rounded-xl text-base min-h-[44px] focus:ring-2 focus:ring-[#4573A2] focus:border-transparent"
          />
        </div>

        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <button
          disabled={pending || !selectedDate}
          onClick={handleSubmit}
          className="w-full px-4 py-3 rounded-xl bg-[#4573A2] text-white font-medium text-sm hover:bg-[#3a6290] disabled:opacity-50 transition-colors"
        >
          {pending ? 'Wird gespeichert...' : 'Termin bestätigen'}
        </button>

        <p className="text-[10px] text-claimondo-ondo/70 text-center">
          Der Versicherungsgutachter passt sich an Ihren gewählten Termin an.
        </p>
      </div>
    </div>
  )
}
