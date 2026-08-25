'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { computeNutzungsausfall, NA_KLASSEN } from '@/lib/tools/nutzungsausfall'

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const inputCls =
  'mt-1 w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none'

export default function NutzungsausfallRechnerClient() {
  const t = useTranslations('nutzungsausfall_rechner')
  const [klasse, setKlasse] = useState('E')
  const [tage, setTage] = useState('')
  const [alter, setAlter] = useState('')

  const result = useMemo(
    () =>
      computeNutzungsausfall({
        klasse,
        tage: parseFloat(tage),
        alterJahre: alter ? parseFloat(alter) : undefined,
      }),
    [klasse, tage, alter],
  )

  return (
    <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-claimondo-navy">{t('titel')}</h3>
      <p className="mt-1 text-sm text-claimondo-shield">{t('intro')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-claimondo-navy sm:col-span-2">
          {t('label_klasse')}
          <select value={klasse} onChange={(e) => setKlasse(e.target.value)} className={inputCls}>
            {NA_KLASSEN.map((k) => (
              <option key={k.klasse} value={k.klasse}>
                {`${k.klasse} · ${k.bezeichnung} – ${k.beispiele}`}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_tage')}
          <input
            type="number"
            inputMode="numeric"
            min={1}
            value={tage}
            onChange={(e) => setTage(e.target.value)}
            className={inputCls}
            placeholder="14"
          />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_alter')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={alter}
            onChange={(e) => setAlter(e.target.value)}
            className={inputCls}
            placeholder="4"
          />
        </label>
      </div>

      <div className="mt-5">
        <AnswerCapsule quelle="§249 BGB · Nutzungsausfall-Orientierungswerte">
          {result.kind === 'unvollstaendig' && <span>{t('ergebnis_unvollstaendig')}</span>}
          {result.kind === 'schaetzung' && (
            <span className="font-semibold text-claimondo-navy">
              {t('ergebnis_schaetzung', {
                min: eur(result.min),
                max: eur(result.max),
                klasse: result.klasse,
                satz: `${result.satzMin}–${result.satzMax} €`,
              })}
            </span>
          )}
        </AnswerCapsule>
        {result.kind === 'schaetzung' &&
          result.hinweise.map((h) => (
            <p key={h} className="mt-2 text-xs text-claimondo-ondo">
              {h === 'rueckstufung'
                ? t('hinweis_rueckstufung', { basis: result.basis, klasse: result.klasse, stufen: result.stufen })
                : t(`hinweis_${h}`)}
            </p>
          ))}
      </div>

      <p className="mt-4 text-xs text-claimondo-shield">{t('disclaimer')}</p>

      <Link
        href="/schaden-melden"
        className="mt-5 inline-flex items-center gap-2 rounded-ios-md bg-claimondo-ondo px-6 py-3 text-sm font-bold text-white hover:bg-claimondo-shield"
      >
        {t('cta')}
      </Link>
    </div>
  )
}
