'use client'

// AAR-956 §3a / AAR-940: Geteilte Kasko-Endansicht — Eigenverschulden bzw.
// disqualifizierter Lead, kein Termin. Fairer Hinweis statt Sackgasse. Genutzt von
// /anfrage (SelbstQualiClient) UND /flow (FlowQualiStep + disqualifiziert-Gate).

import { useTranslations } from 'next-intl'

export function KaskoEndansicht() {
  const t = useTranslations('selfService')
  return (
    <div className="max-w-md text-center" data-testid="quali-abbruch">
      <h1 className="text-2xl font-semibold text-claimondo-navy mb-3">{t('kasko.heading')}</h1>
      <p className="text-claimondo-navy/80 mb-2">
        {t('kasko.body')}
      </p>
      <p className="text-claimondo-navy/60 text-sm">
        {t('kasko.note')}
      </p>
    </div>
  )
}
