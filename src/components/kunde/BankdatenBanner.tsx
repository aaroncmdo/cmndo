'use client'

import { useState, useTransition } from 'react'
import { BanknoteIcon, CheckCircleIcon } from 'lucide-react'

const SHOW_STATUSES = ['gutachten-eingegangen', 'filmcheck', 'qc-pruefung', 'kanzlei-uebergeben', 'anschlussschreiben', 'regulierung-laeuft', 'regulierung']

function validateIban(iban: string): boolean {
  const cleaned = iban.replace(/\s/g, '').toUpperCase()
  if (cleaned.length < 15 || cleaned.length > 34) return false
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(cleaned)) return false
  return true
}

export default function BankdatenBanner({
  fallId,
  status,
  bankdatenHinterlegt,
  saveBankdaten,
}: {
  fallId: string
  status: string
  bankdatenHinterlegt: boolean
  saveBankdaten: (fallId: string, iban: string, bic: string, kontoinhaber: string) => Promise<{ success: boolean; error?: string }>
}) {
  const [pending, startTransition] = useTransition()
  const [showForm, setShowForm] = useState(false)
  const [iban, setIban] = useState('')
  const [bic, setBic] = useState('')
  const [kontoinhaber, setKontoinhaber] = useState('')
  const [error, setError] = useState('')
  const [done, setDone] = useState(bankdatenHinterlegt)

  if (!SHOW_STATUSES.includes(status) || done) return null

  function handleSubmit() {
    const cleanIban = iban.replace(/\s/g, '').toUpperCase()
    if (!validateIban(cleanIban)) {
      setError('Bitte gib eine gültige IBAN ein.')
      return
    }
    if (!kontoinhaber.trim()) {
      setError('Bitte gib den Kontoinhaber an.')
      return
    }
    setError('')
    startTransition(async () => {
      try {
        const res = await saveBankdaten(fallId, cleanIban, bic.trim().toUpperCase(), kontoinhaber.trim())
        if (res.success) {
          setDone(true)
        } else {
          setError(res.error ?? 'Fehler beim Speichern')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fehler beim Speichern')
      }
    })
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full bg-amber-50 border-2 border-amber-200 rounded-2xl p-5 flex items-center gap-4 hover:bg-amber-100 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
          <BanknoteIcon className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Bankdaten für Auszahlung hinterlegen</p>
          <p className="text-xs text-amber-600 mt-0.5">Damit wir den Betrag an dich auszahlen können, benötigen wir deine Kontodaten.</p>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-white border-2 border-amber-200 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
        <BanknoteIcon className="w-4 h-4 text-amber-600" />
        Bankdaten für Auszahlung
      </h3>

      {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-claimondo-ondo mb-1">IBAN *</label>
          <input
            type="text"
            value={iban}
            onChange={e => setIban(e.target.value)}
            placeholder="DE89 3704 0044 0532 0130 00"
            className="w-full px-3 py-2.5 border border-claimondo-border rounded-lg text-sm font-mono tracking-wider"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">BIC (optional)</label>
            <input
              type="text"
              value={bic}
              onChange={e => setBic(e.target.value)}
              placeholder="COBADEFFXXX"
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">Kontoinhaber *</label>
            <input
              type="text"
              value={kontoinhaber}
              onChange={e => setKontoinhaber(e.target.value)}
              placeholder="Max Mustermann"
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-lg text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowForm(false)} className="flex-1 px-3 py-2.5 rounded-lg border border-claimondo-border text-claimondo-ondo text-sm font-medium hover:bg-claimondo-bg">
          Abbrechen
        </button>
        <button disabled={pending} onClick={handleSubmit} className="flex-1 px-3 py-2.5 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50">
          {pending ? 'Speichern...' : 'Bankdaten speichern'}
        </button>
      </div>
    </div>
  )
}
