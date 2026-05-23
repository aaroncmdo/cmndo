'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { SF_PROVIDERS, DEFAULT_BASE_PREMIUM_EUR, type SfProvider } from '@/lib/tools/sf-versicherer'
import { trackToolComplete } from '@/lib/track'

// SF-Rückstufungs-Rechner v2 (versicherer-spezifisch) · 1:1 portiert aus
// assets-autounfall/sf-rueckstufungs-rechner-widget.js. State in localStorage
// 'au-sf-rechner-v2'. Berechnungs-Logik (Wiederaufstiegs-Jahre, Mean-Rate-
// Mehrkosten, Empfehlungs-Schwellen) exakt. CTA → /gutachter-finden (WP-6).
// actionColor „melden“ auf Brand-Accent (au-amber) gemappt.

const STORAGE_KEY = 'au-sf-rechner-v2'

type State = { providerId: string; sfId: string; schaden: string }

type Result = {
  provider: SfProvider
  oldSf: string
  oldRate: number
  newSf: string
  newRate: number
  yearsToRecover: number
  mehrkosten: number
  recommendation: { action: 'selbst-zahlen' | 'melden' | 'rabattschutz-pruefen'; text: string }
}

function sfRate(provider: SfProvider, sfId: string): number | null {
  const e = provider.sfTable.find((x) => x.id === sfId)
  return e ? e.rate : null
}

function calcResult(state: State): Result | null {
  const schaden = Number(state.schaden)
  if (!state.providerId || !state.sfId || !schaden || schaden <= 0) return null
  const provider = SF_PROVIDERS[state.providerId]
  if (!provider) return null
  const oldRate = sfRate(provider, state.sfId)
  if (oldRate == null) return null
  const newSfId = provider.rueckstufung1Schaden[state.sfId]
  if (!newSfId) return null
  const newRate = sfRate(provider, newSfId)
  if (newRate == null) return null

  let yearsToRecover = 0
  let cur = newSfId
  let guard = 40
  while (cur !== state.sfId && guard-- > 0) {
    const idx = provider.sfTable.findIndex((e) => e.id === cur)
    if (idx < 0 || idx >= provider.sfTable.length - 1) break
    cur = provider.sfTable[idx + 1].id
    yearsToRecover++
  }

  const basePremium = DEFAULT_BASE_PREMIUM_EUR
  const meanRate = (newRate + oldRate) / 2 / 100
  const oldRateFrac = oldRate / 100
  const mehrkostenPerYear = basePremium * (meanRate - oldRateFrac)
  const totalMehrkosten = Math.max(0, Math.round(mehrkostenPerYear * yearsToRecover))

  let rec: Result['recommendation']
  if (schaden < totalMehrkosten) {
    rec = {
      action: 'selbst-zahlen',
      text: `Schaden ${schaden.toLocaleString('de-DE')} € liegt UNTER den Beitrags-Mehrkosten ${totalMehrkosten.toLocaleString('de-DE')} €. Selbst zahlen ist günstiger.`,
    }
  } else if (schaden > totalMehrkosten * 1.5) {
    rec = {
      action: 'melden',
      text: `Schaden ${schaden.toLocaleString('de-DE')} € übersteigt die Mehrkosten deutlich. Versicherung melden lohnt sich.`,
    }
  } else {
    rec = {
      action: 'rabattschutz-pruefen',
      text: 'Schaden und Mehrkosten liegen nah beieinander. Prüfen Sie, ob ein Rabattschutz vorliegt.',
    }
  }

  return {
    provider,
    oldSf: state.sfId,
    oldRate,
    newSf: newSfId,
    newRate,
    yearsToRecover,
    mehrkosten: totalMehrkosten,
    recommendation: rec,
  }
}

const ACTION_TEXT: Record<Result['recommendation']['action'], string> = {
  'selbst-zahlen': 'text-au-success',
  melden: 'text-au-amber',
  'rabattschutz-pruefen': 'text-au-teal',
}
const ACTION_LABEL: Record<Result['recommendation']['action'], string> = {
  'selbst-zahlen': 'Empfehlung: SELBST ZAHLEN',
  melden: 'Empfehlung: VERSICHERUNG MELDEN',
  'rabattschutz-pruefen': 'Empfehlung: RABATTSCHUTZ PRÜFEN',
}

const selectCls =
  'w-full box-border rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-3.5 py-3 text-base text-au-ink focus-visible:border-au-amber focus-visible:outline-2 focus-visible:outline-au-amber disabled:opacity-50'
const labelCls = 'mb-1.5 block font-mono text-[11px] font-semibold uppercase tracking-wide text-au-ink-soft'

export function SfRechner({ defaultProvider }: { defaultProvider?: string }) {
  const [state, setState] = useState<State>(() => ({
    providerId: defaultProvider && SF_PROVIDERS[defaultProvider] ? defaultProvider : '',
    sfId: '',
    schaden: '',
  }))
  const firedRef = useRef(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>
        setState((cur) => ({
          providerId: parsed.providerId ?? cur.providerId,
          sfId: parsed.sfId ?? '',
          schaden: parsed.schaden ?? '',
        }))
      }
    } catch {
      /* ignore */
    }
  }, [])

  function persist(next: State) {
    setState(next)
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      /* ignore */
    }
  }
  function reset() {
    try {
      localStorage.removeItem(STORAGE_KEY)
    } catch {
      /* ignore */
    }
    setState({ providerId: '', sfId: '', schaden: '' })
  }

  const provider = state.providerId ? SF_PROVIDERS[state.providerId] : undefined
  const result = calcResult(state)

  useEffect(() => {
    if (result && !firedRef.current) {
      firedRef.current = true
      trackToolComplete('sf-rechner')
    } else if (!result) {
      firedRef.current = false
    }
  }, [result])

  const providerSlug = result
    ? result.provider.name.toLowerCase().replace(/[^a-z0-9]/g, '-')
    : ''

  return (
    <div className="rounded-ios-md border border-au-sand-dark bg-au-surface p-6 sm:p-7">
      <div className="mb-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-au-amber-dark">
          SF-Rückstufungs-Rechner · v2 · jetzt versicherer-spezifisch
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-au-ink">
          Wie teuer wird ein Unfall wirklich?
        </h2>
      </div>

      <div className="mb-3">
        <label htmlFor="sf-rechner-versicherer" className={labelCls}>
          1 · Ihre Versicherung
        </label>
        <select
          id="sf-rechner-versicherer"
          className={selectCls}
          value={state.providerId}
          onChange={(e) => persist({ providerId: e.target.value, sfId: '', schaden: state.schaden })}
        >
          <option value="">— Bitte wählen —</option>
          {Object.entries(SF_PROVIDERS).map(([id, p]) => (
            <option key={id} value={id}>
              {p.name} · {p.type}
            </option>
          ))}
        </select>
        {provider ? (
          <p className="mt-1.5 text-[13px] leading-relaxed text-au-ink-soft">{provider.besonderheiten}</p>
        ) : null}
      </div>

      <div className="mb-3">
        <label htmlFor="sf-rechner-sf" className={labelCls}>
          2 · Aktuelle SF-Klasse
        </label>
        <select
          id="sf-rechner-sf"
          className={selectCls}
          disabled={!provider}
          value={state.sfId}
          onChange={(e) => persist({ ...state, sfId: e.target.value })}
        >
          <option value="">{provider ? '— Bitte wählen —' : 'Erst Versicherung wählen'}</option>
          {provider
            ? provider.sfTable.map((e) => (
                <option key={e.id} value={e.id}>
                  SF {e.id} · Beitragssatz {e.rate} %
                </option>
              ))
            : null}
        </select>
      </div>

      <div className="mb-3">
        <label htmlFor="sf-rechner-schaden" className={labelCls}>
          3 · Geschätzte Schadenhöhe (€)
        </label>
        <input
          id="sf-rechner-schaden"
          type="number"
          inputMode="numeric"
          min={0}
          step={100}
          placeholder="z.B. 2500"
          className={selectCls}
          value={state.schaden}
          onChange={(e) => persist({ ...state, schaden: e.target.value })}
        />
        <p className="mt-1.5 text-[13px] leading-relaxed text-au-ink-soft">
          Default Jahres-Beitrag bei SF 0: {DEFAULT_BASE_PREMIUM_EUR} € · für genauere Schätzung im
          Vertrag prüfen
        </p>
      </div>

      {result ? <ResultView r={result} providerSlug={providerSlug} /> : null}

      <button
        type="button"
        onClick={reset}
        className="mt-4 block text-sm font-semibold text-au-ink-soft underline"
      >
        ↺ Zurücksetzen
      </button>
    </div>
  )
}

function ResultView({ r, providerSlug }: { r: Result; providerSlug: string }) {
  const maxRate = Math.max(r.oldRate, r.newRate)
  const oldPct = Math.round((r.oldRate / maxRate) * 100)
  const newPct = 100

  return (
    <>
      <div className="mt-4 rounded-ios-sm bg-au-ink p-4 text-au-surface">
        <p className="font-mono text-[11px] uppercase tracking-wider text-au-amber-soft">
          Ihre Analyse · {r.provider.name}
        </p>
        <p className="mt-1 font-display text-3xl font-extrabold">
          {r.mehrkosten.toLocaleString('de-DE')} €
        </p>
        <p className="mt-1 text-sm text-au-surface/70">
          Beitrags-Mehrkosten über {r.yearsToRecover} Jahre Wiederaufstieg · SF {r.oldSf} → SF {r.newSf}{' '}
          · Beitragssatz {r.oldRate}% → {r.newRate}%
        </p>
      </div>

      <div className="mt-3 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-4">
        <div className="mb-2 flex items-center gap-3">
          <span className="w-[88px] shrink-0 text-[13px] text-au-ink-soft">Aktuell</span>
          <div className="h-6 flex-1 overflow-hidden rounded-full bg-au-sand-dark">
            <div
              className="flex h-full items-center justify-end rounded-full bg-au-ink px-2 text-[11px] font-semibold text-au-surface"
              style={{ width: `${oldPct}%` }}
            >
              SF {r.oldSf} · {r.oldRate}%
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="w-[88px] shrink-0 text-[13px] text-au-ink-soft">Nach Schaden</span>
          <div className="h-6 flex-1 overflow-hidden rounded-full bg-au-sand-dark">
            <div
              className="flex h-full items-center justify-end rounded-full bg-au-amber px-2 text-[11px] font-semibold text-au-surface"
              style={{ width: `${newPct}%` }}
            >
              SF {r.newSf} · {r.newRate}%
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-au-ink-soft">
          <strong className={ACTION_TEXT[r.recommendation.action]}>
            {ACTION_LABEL[r.recommendation.action]}
          </strong>
          <br />
          {r.recommendation.text}
        </p>
      </div>

      <div className="mt-3 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-4">
        <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-au-ink-soft">
          Was Sie durch diese Rechnung gewinnen
        </p>
        <div className="space-y-1.5 text-sm text-au-ink-soft">
          <p>
            <strong className="text-au-ink">Finanziell:</strong>{' '}
            {r.mehrkosten.toLocaleString('de-DE')} € transparent · keine Überraschung
          </p>
          <p>
            <strong className="text-au-ink">Zeitlich:</strong> 60 Sekunden · ohne Versicherung anzurufen
          </p>
          <p>
            <strong className="text-au-ink">Emotional:</strong> Entscheidungs-Sicherheit
            selbst-zahlen vs. melden
          </p>
          <p>
            <strong className="text-au-ink">Kosten für Sie:</strong> 0 € · ohne Anmeldung · ohne
            Datenweitergabe
          </p>
        </div>
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-au-muted">
        <strong className="text-au-ink-soft">Schätzung.</strong> Tatsächliche Werte hängen von
        Tarif-Details, Rabattschutz, Vertragsalter ab. Die genaue SF-Tabelle steht in Ihrem
        Versicherungsschein. AKB-Daten Stand 05/2026.
      </p>

      <Link
        href={`/gutachter-finden?ref=sf-rechner&provider=${providerSlug}`}
        className="mt-3.5 inline-flex items-center gap-2 rounded-ios-sm bg-au-amber px-[18px] py-3 text-[15px] font-bold text-au-surface transition-opacity hover:opacity-90"
      >
        Sachverständigen-Termin anfragen →
      </Link>
    </>
  )
}
