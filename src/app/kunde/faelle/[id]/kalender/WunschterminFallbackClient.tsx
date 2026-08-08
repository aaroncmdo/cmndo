'use client'

// Kunde-Termin-Funnel T4: Wunschtermin-Fallback, wenn dem Claim noch kein SV zugewiesen ist
// (Kalender-Sackgasse ersetzt). Der Kunde wählt eine Wunschzeit → sv_gesucht-Termin in die
// Dispatch-Queue. Nutzt den vergangenheits-gefilterten WunschterminPicker (T5).

import { useState } from 'react'
import { useTranslations, useFormatter } from 'next-intl'
import { useRouter } from 'next/navigation'
import { WunschterminPicker } from '@/app/embed/gutachter-finder/_components/WunschterminPicker'
import { NoticeBox } from '@/components/shared/NoticeBox'
import { erbitteWunschterminPortal } from './actions'

export default function WunschterminFallbackClient({ fallId }: { fallId: string }) {
  const t = useTranslations('kunde.fall')
  const format = useFormatter()
  const router = useRouter()
  const [wunsch, setWunsch] = useState('')
  const [loading, setLoading] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function handleSenden() {
    if (!wunsch) return
    setLoading(true)
    setFehler(null)
    const result = await erbitteWunschterminPortal(fallId, wunsch)
    setLoading(false)
    if (result.ok) {
      setDone(true)
    } else {
      setFehler(result.error ?? t('kalender.wunschFehler'))
    }
  }

  if (done) {
    return (
      <NoticeBox tone="success" className="rounded-ios-xl p-8 text-center">
        <p className="text-lg font-semibold text-success-strong mb-2">{t('kalender.wunschGesendet')}</p>
        <p className="text-sm text-success mb-4">
          {wunsch && format.dateTime(new Date(wunsch), { timeZone: 'Europe/Berlin', weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-sm text-success mb-4">{t('kalender.wunschHinweis')}</p>
        <button
          onClick={() => router.push(`/kunde/faelle/${fallId}`)}
          className="px-4 py-2 bg-claimondo-ondo text-white rounded-ios-lg text-sm font-medium hover:bg-claimondo-shield transition-colors"
        >
          {t('kalender.zurueck')}
        </button>
      </NoticeBox>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-ios-xl border border-claimondo-border shadow-sm p-5">
        <h2 className="text-base font-bold text-claimondo-navy mb-1">{t('kalender.wunschTitel')}</h2>
        <p className="text-sm text-claimondo-ondo mb-4">{t('kalender.wunschIntro')}</p>
        <WunschterminPicker value={wunsch} onChange={setWunsch} />
        {fehler && <p className="mt-3 text-sm text-danger">{fehler}</p>}
        <button
          onClick={handleSenden}
          disabled={loading || !wunsch}
          className="mt-4 w-full py-3 rounded-ios-xl bg-claimondo-ondo text-white font-medium text-sm hover:bg-claimondo-shield transition-colors disabled:opacity-40"
        >
          {loading ? t('kalender.wirdGesendet') : t('kalender.wunschSenden')}
        </button>
      </div>
    </div>
  )
}
