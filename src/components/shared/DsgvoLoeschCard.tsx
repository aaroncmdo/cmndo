'use client'

// DSGVO Art. 17 — Self-Service-Account-Löschung im Kunde-Portal.
// Idempotent gegen Doppel-Antraege; zeigt Status wenn bereits gestellt.

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { ShieldAlertIcon, CheckIcon, XIcon, ClockIcon } from 'lucide-react'
import {
  stelleLoeschAntrag,
  storniereLoeschAntrag,
} from '@/lib/actions/dsgvo-loeschung'

type ExistingAuftrag = {
  id: string
  status: 'eingereicht' | 'bestaetigt' | 'ausgefuehrt'
  eingereicht_am: string
  bestaetigt_am: string | null
  grund: string | null
} | null

type Props = {
  bestehenderAuftrag: ExistingAuftrag
}

export default function DsgvoLoeschCard({ bestehenderAuftrag }: Props) {
  const t = useTranslations('dsgvoLoesch')
  const [isOpen, setIsOpen] = useState(false)
  const [grund, setGrund] = useState('')
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [auftrag, setAuftrag] = useState<ExistingAuftrag>(bestehenderAuftrag)

  function antragStellen() {
    setError(null)
    startTransition(async () => {
      const r = await stelleLoeschAntrag(grund || undefined)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAuftrag({
        id: r.auftragId,
        status: 'eingereicht',
        eingereicht_am: new Date().toISOString(),
        bestaetigt_am: null,
        grund: grund || null,
      })
      setIsOpen(false)
    })
  }

  function antragStornieren(id: string) {
    setError(null)
    startTransition(async () => {
      const r = await storniereLoeschAntrag(id)
      if (!r.ok) {
        setError(r.error)
        return
      }
      setAuftrag(null)
    })
  }

  // Bereits eingereichter Antrag → Status anzeigen
  if (auftrag) {
    return (
      <div className="rounded-ios-xl border border-warning/30 bg-warning-soft p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-xl bg-warning-soft text-warning-strong">
            <ClockIcon width={18} height={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-warning-strong">
              {t('antragLiegtVor')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-warning-strong">
              {t('eingereichtAm', {
                datum: new Date(auftrag.eingereicht_am).toLocaleDateString('de-DE', {
                  timeZone: 'Europe/Berlin',
                  day: '2-digit',
                  month: 'long',
                  year: 'numeric',
                }),
              })}
              {auftrag.status === 'eingereicht' && (
                <strong>{t('statusWartet')}</strong>
              )}
              {auftrag.status === 'bestaetigt' && (
                <strong>{t('statusBestaetigt')}</strong>
              )}
              {auftrag.status === 'ausgefuehrt' && <strong>{t('statusAusgefuehrt')}</strong>}
            </p>
            {auftrag.status !== 'ausgefuehrt' && (
              <button
                type="button"
                onClick={() => antragStornieren(auftrag.id)}
                disabled={pending}
                className="mt-3 inline-flex items-center gap-1.5 rounded-ios-lg border border-warning/30 bg-white px-3 py-1.5 text-xs font-semibold text-warning-strong hover:bg-warning/15 disabled:opacity-50"
              >
                <XIcon width={12} height={12} />
                {pending ? t('stornierenPending') : t('stornieren')}
              </button>
            )}
            {error && (
              <p className="mt-2 text-xs text-danger-strong">{error}</p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // Initial-Zustand: Button zum Antrag stellen
  if (!isOpen) {
    return (
      <div className="rounded-ios-xl border border-claimondo-border bg-white p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-xl bg-danger-soft text-danger">
            <ShieldAlertIcon width={18} height={18} />
          </span>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-claimondo-navy">
              {t('titelInitial')}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-claimondo-ondo">
              {t('dsgvoText')}
            </p>
            <button
              type="button"
              onClick={() => setIsOpen(true)}
              className="mt-3 inline-flex items-center gap-1.5 rounded-ios-lg border border-danger/30 bg-danger-soft px-3 py-1.5 text-xs font-semibold text-danger-strong hover:bg-danger/15"
            >
              {t('antragStellen')}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Confirm-Form mit optionaler Grund-Angabe
  return (
    <div className="rounded-ios-xl border border-danger/30 bg-danger-soft/50 p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-ios-xl bg-danger-soft text-danger-strong">
          <ShieldAlertIcon width={18} height={18} />
        </span>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-claimondo-navy">
            {t('sicherTitel')}
          </h3>
          <p className="mt-1 text-xs leading-relaxed text-claimondo-ondo">
            {t('sicherText')}
          </p>
          <label className="mt-3 block">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-claimondo-ondo">
              {t('grundLabel')}
            </span>
            <textarea
              value={grund}
              onChange={(e) => setGrund(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder={t('grundPlaceholder')}
              className="mt-1 w-full rounded-ios-lg border border-claimondo-border bg-white p-2 text-xs"
            />
          </label>
          {error && (
            <p className="mt-2 text-xs text-danger-strong">{error}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={antragStellen}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-ios-lg bg-danger px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-danger-strong disabled:opacity-50"
            >
              <CheckIcon width={12} height={12} />
              {pending ? t('jaAntragStellenPending') : t('jaAntragStellen')}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false)
                setGrund('')
                setError(null)
              }}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-ios-lg border border-claimondo-border bg-white px-3.5 py-1.5 text-xs font-semibold text-claimondo-navy hover:bg-claimondo-bg disabled:opacity-50"
            >
              {t('abbrechen')}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
