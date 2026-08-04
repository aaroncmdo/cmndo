'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { AnswerCapsule } from '@/components/landing/AnswerCapsule'
import { computeWertminderung, type Vorschaden } from '@/lib/tools/wertminderung'

const eur = (n: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n)
const inputCls =
  'mt-1 w-full rounded-ios-sm border border-claimondo-border bg-white px-3 py-2 text-sm text-claimondo-navy focus:border-claimondo-ondo focus:outline-none'

export default function WertminderungRechnerClient() {
  const t = useTranslations('wertminderung_rechner')
  const [rep, setRep] = useState('')
  const [alter, setAlter] = useState('')
  const [km, setKm] = useState('')
  const [wbw, setWbw] = useState('')
  const [vorschaden, setVorschaden] = useState<Vorschaden>('keine')

  const result = useMemo(
    () =>
      computeWertminderung({
        reparaturkosten: parseFloat(rep),
        alterJahre: parseFloat(alter),
        km: km ? parseFloat(km) : undefined,
        wbw: wbw ? parseFloat(wbw) : undefined,
        vorschaden,
      }),
    [rep, alter, km, wbw, vorschaden],
  )

  return (
    <div className="mt-6 rounded-ios-md border border-claimondo-border bg-white p-6 shadow-sm">
      <h3 className="text-lg font-bold text-claimondo-navy">{t('titel')}</h3>
      <p className="mt-1 text-sm text-claimondo-shield">{t('intro')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_reparaturkosten')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={rep}
            onChange={(e) => setRep(e.target.value)}
            className={inputCls}
            placeholder="10000"
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
            placeholder="3"
          />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_km')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={km}
            onChange={(e) => setKm(e.target.value)}
            className={inputCls}
            placeholder="60000"
          />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy">
          {t('label_wbw')}
          <input
            type="number"
            inputMode="numeric"
            min={0}
            value={wbw}
            onChange={(e) => setWbw(e.target.value)}
            className={inputCls}
            placeholder="15000"
          />
        </label>
        <label className="block text-sm font-semibold text-claimondo-navy sm:col-span-2">
          {t('label_vorschaden')}
          <select
            value={vorschaden}
            onChange={(e) => setVorschaden(e.target.value as Vorschaden)}
            className={inputCls}
          >
            <option value="keine">{t('vorschaden_keine')}</option>
            <option value="repariert">{t('vorschaden_repariert')}</option>
            <option value="erheblich">{t('vorschaden_erheblich')}</option>
          </select>
        </label>
      </div>

      <div className="mt-5">
        <AnswerCapsule quelle="§251 BGB · BGH VI ZR 357/03">
          {result.kind === 'unvollstaendig' && <span>{t('ergebnis_unvollstaendig')}</span>}
          {result.kind === 'einzelfall' && (
            <span>
              {result.hinweise.includes('einzelfall_vorschaden')
                ? t('ergebnis_einzelfall_vorschaden')
                : t('ergebnis_einzelfall_alter')}
            </span>
          )}
          {result.kind === 'schaetzung' && (
            <span className="font-semibold text-claimondo-navy">
              {t('ergebnis_schaetzung', { betrag: eur(result.betrag), pct: `${Math.round(result.pct * 100)} %` })}
            </span>
          )}
        </AnswerCapsule>
        {result.kind === 'schaetzung' &&
          result.hinweise.map((h) => (
            <p key={h} className="mt-2 text-xs text-claimondo-ondo">
              {t(`hinweis_${h}`)}
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
