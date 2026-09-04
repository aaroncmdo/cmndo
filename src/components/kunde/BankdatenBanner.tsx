'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { BanknoteIcon, CheckCircleIcon } from 'lucide-react'
import { BANKDATEN_SHOW_STATUSES } from '@/lib/kunde/bankdaten-status'

const SHOW_STATUSES: readonly string[] = BANKDATEN_SHOW_STATUSES

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
  const t = useTranslations('bankdaten')
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
      setError(t('fehlerIban'))
      return
    }
    if (!kontoinhaber.trim()) {
      setError(t('fehlerKontoinhaber'))
      return
    }
    setError('')
    startTransition(async () => {
      try {
        const res = await saveBankdaten(fallId, cleanIban, bic.trim().toUpperCase(), kontoinhaber.trim())
        if (res.success) {
          setDone(true)
        } else {
          setError(res.error ?? t('fehlerSpeichern'))
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : t('fehlerSpeichern'))
      }
    })
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="w-full bg-warning-soft border-2 border-warning/30 rounded-2xl p-5 flex items-center gap-4 hover:bg-warning/15 transition-colors text-left"
      >
        <div className="w-10 h-10 rounded-ios-xl bg-warning-soft flex items-center justify-center shrink-0">
          <BanknoteIcon className="w-5 h-5 text-warning" />
        </div>
        <div>
          <p className="text-sm font-semibold text-warning-strong">{t('bannerTitel')}</p>
          <p className="text-body-sm text-warning mt-0.5">{t('bannerSub')}</p>
        </div>
      </button>
    )
  }

  return (
    <div className="bg-white border-2 border-warning/30 rounded-2xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-claimondo-navy flex items-center gap-2">
        <BanknoteIcon className="w-4 h-4 text-warning" />
        {t('formTitel')}
      </h3>

      {error && <p className="text-xs text-danger bg-danger-soft px-3 py-2 rounded-ios-lg">{error}</p>}

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-claimondo-ondo mb-1">{t('ibanLabel')}</label>
          <input
            type="text"
            value={iban}
            onChange={e => setIban(e.target.value)}
            placeholder={t('ibanPlaceholder')}
            className="w-full px-3 py-2.5 border border-claimondo-border rounded-ios-lg text-sm font-mono tracking-wider"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">{t('bicLabel')}</label>
            <input
              type="text"
              value={bic}
              onChange={e => setBic(e.target.value)}
              placeholder={t('bicPlaceholder')}
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-ios-lg text-sm font-mono"
            />
          </div>
          <div>
            <label className="block text-xs text-claimondo-ondo mb-1">{t('kontoinhaberLabel')}</label>
            <input
              type="text"
              value={kontoinhaber}
              onChange={e => setKontoinhaber(e.target.value)}
              placeholder={t('kontoinhaberPlaceholder')}
              className="w-full px-3 py-2.5 border border-claimondo-border rounded-ios-lg text-sm"
            />
          </div>
        </div>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setShowForm(false)} className="flex-1 px-3 py-2.5 rounded-ios-lg border border-claimondo-border text-claimondo-ondo text-sm font-medium hover:bg-claimondo-bg">
          {t('abbrechen')}
        </button>
        <button disabled={pending} onClick={handleSubmit} className="flex-1 px-3 py-2.5 rounded-ios-lg bg-warning text-white text-sm font-medium hover:bg-warning-strong disabled:opacity-50">
          {pending ? t('speichernPending') : t('speichern')}
        </button>
      </div>
    </div>
  )
}
