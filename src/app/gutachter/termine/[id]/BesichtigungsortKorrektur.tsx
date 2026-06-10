'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { CheckCircleIcon, MapPinIcon } from 'lucide-react'
import GooglePlaceAutocomplete, { type PlaceResult } from '@/components/GooglePlaceAutocomplete'
import { korrigiereBesichtigungsortAlsSv } from '@/lib/termine/actions'

// AAR-939 termin-engine: SV-seitiger Besichtigungsort Trust-Badge + Korrektur-Affordance.
// - Zeigt "Vom Kunden bestätigt"-Badge (emerald) wenn bestaetigtVon === 'kunde'.
// - Zeigt "Ort korrigieren"-Link mit aufklappbarem GooglePlaceAutocomplete.

interface Props {
  terminId: string
  bestaetigtVon: string | null
}

export default function BesichtigungsortKorrektur({ terminId, bestaetigtVon }: Props) {
  const t = useTranslations('gutachter.feldmodus.besichtigungsort')
  const router = useRouter()
  const [korrigieren, setKorrigieren] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handlePlaceSelect(p: PlaceResult) {
    setError(null)
    startTransition(async () => {
      const r = await korrigiereBesichtigungsortAlsSv(terminId, {
        adresse: p.adresse,
        lat: p.lat,
        lng: p.lng,
      })
      if (r.ok) {
        setKorrigieren(false)
        router.refresh()
      } else {
        setError(r.error ?? 'Fehler beim Speichern')
      }
    })
  }

  return (
    <div className="mt-1 space-y-1">
      {/* Trust-Badge: Vom Kunden bestätigt */}
      {bestaetigtVon === 'kunde' && (
        <span className="inline-flex items-center gap-1 text-xs text-success-strong font-medium">
          <CheckCircleIcon className="w-3.5 h-3.5 text-success flex-shrink-0" />
          {t('vomKundenBestaetigt')}
        </span>
      )}

      {/* Ort-Korrektur-Affordance */}
      {korrigieren ? (
        <div className="space-y-1.5 pt-1">
          <GooglePlaceAutocomplete
            placeholder={t('korrigieren')}
            onSelect={handlePlaceSelect}
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <button
            type="button"
            onClick={() => { setKorrigieren(false); setError(null) }}
            disabled={isPending}
            className="text-xs text-claimondo-ondo underline disabled:opacity-50"
          >
            Abbrechen
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setKorrigieren(true)}
          disabled={isPending}
          className="inline-flex items-center gap-1 text-xs text-claimondo-ondo hover:text-claimondo-navy underline disabled:opacity-50 transition-colors"
        >
          <MapPinIcon className="w-3 h-3" />
          {t('korrigieren')}
        </button>
      )}
    </div>
  )
}
