'use client'

import { useState, useTransition } from 'react'
import { useTranslations } from 'next-intl'
import { CheckCircleIcon, MapPinIcon } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import {
  bestaetigeBesichtigungsortViaToken,
  korrigiereBesichtigungsortViaToken,
} from './actions'
import { Button } from '@/components/primitives/Button'

type State = 'idle' | 'correcting' | 'done'

export default function BesichtigungsortCheck({
  token,
  terminId,
  adresse,
  bestaetigt,
  variant,
}: {
  token: string
  terminId: string
  adresse: string
  bestaetigt: boolean
  variant: 'card' | 'link'
}) {
  const t = useTranslations('kunde.tracking.besichtigungsort')
  const [state, setState] = useState<State>(bestaetigt ? 'done' : 'idle')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleBestaetigen() {
    setError(null)
    startTransition(async () => {
      const r = await bestaetigeBesichtigungsortViaToken(token, terminId)
      if (r.success) {
        setState('done')
      } else {
        setError(r.error)
      }
    })
  }

  function handlePlaceSelect(p: PlaceResult) {
    setError(null)
    startTransition(async () => {
      const r = await korrigiereBesichtigungsortViaToken(token, terminId, {
        adresse: p.adresse,
        lat: p.lat,
        lng: p.lng,
      })
      if (r.success) {
        setState('done')
      } else {
        setError(r.error)
      }
    })
  }

  if (variant === 'card') {
    if (state === 'done') {
      return (
        <div className="bg-white border border-claimondo-border rounded-2xl p-4 flex items-center gap-2">
          <CheckCircleIcon className="w-4 h-4 text-success flex-shrink-0" />
          <span className="text-sm text-success-strong font-medium">{t('bestaetigt')}</span>
        </div>
      )
    }

    return (
      <div className="bg-white border border-claimondo-border rounded-2xl p-4 space-y-3">
        <div className="flex items-start gap-2">
          <MapPinIcon className="w-4 h-4 flex-shrink-0 mt-0.5 text-claimondo-ondo" />
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-claimondo-ondo mb-0.5">{t('titel')}</p>
            <p className="text-sm font-medium text-claimondo-navy">{adresse}</p>
          </div>
        </div>
        <p className="text-sm text-claimondo-ondo">{t('frage')}</p>

        {state === 'correcting' ? (
          <div className="space-y-2">
            <GooglePlaceAutocomplete
              placeholder={t('korrigieren')}
              onSelect={handlePlaceSelect}
            />
            {error && <p className="text-xs text-danger">{error}</p>}
            <button
              type="button"
              onClick={() => { setState('idle'); setError(null) }}
              disabled={isPending}
              className="w-full min-h-[44px] rounded-ios-xl text-sm bg-claimondo-bg text-claimondo-ondo disabled:opacity-50"
            >
              {t('abbrechen')}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {error && <p className="text-xs text-danger">{error}</p>}
            <Button
              variant="navy"
              fullWidth
              onClick={handleBestaetigen}
              loading={isPending}
              iconLeft={<CheckCircleIcon className="w-4 h-4" />}
            >
              {t('jaStimmt')}
            </Button>
            <Button
              variant="ghost"
              fullWidth
              onClick={() => setState('correcting')}
              disabled={isPending}
            >
              {t('korrigieren')}
            </Button>
          </div>
        )}
      </div>
    )
  }

  // variant === 'link'
  if (state === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-success-strong">
        <CheckCircleIcon className="w-3 h-3" />
        {t('bestaetigt')}
      </span>
    )
  }

  return (
    <div className="space-y-2">
      {state === 'correcting' ? (
        <>
          <GooglePlaceAutocomplete
            placeholder={t('korrigieren')}
            onSelect={handlePlaceSelect}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => { setState('idle'); setError(null) }}
            disabled={isPending}
            className="text-xs text-claimondo-ondo underline disabled:opacity-50"
          >
            {t('abbrechen')}
          </button>
        </>
      ) : (
        <>
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => setState('correcting')}
            disabled={isPending}
            className="text-xs text-claimondo-ondo underline flex items-center gap-1 disabled:opacity-50"
          >
            <MapPinIcon className="w-3 h-3" />
            {t('korrigieren')}
          </button>
        </>
      )}
    </div>
  )
}
