'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  KCHECK_POSITIONS,
  KCHECK_SITUATIONS,
  type KCheckSituation,
  type KCheckTone,
} from '@/lib/tools/kuerzungs-checker-data'
import { trackToolComplete } from '@/lib/track'

// Kürzungs-Checker · 3-Step Decision-Tree · 1:1 portiert aus
// assets-autounfall/kuerzungs-checker-widget.js. State in localStorage
// 'au-kuerzungs-checker-v1'. Logik (Positionen-Summe, Situation, Wert-Boxen,
// CTAs) exakt; nur als React (statt innerHTML) + au-Tokens. tone „fight" auf den
// Brand-Accent (au-amber) gemappt — rescue/perfect=success, split=teal bleiben.

const STORAGE_KEY = 'au-kuerzungs-checker-v1'

type State = { step: number; positions: string[]; situation: string | null }
const DEFAULT_STATE: State = { step: 1, positions: [], situation: null }

const TONE_BG: Record<KCheckTone, string> = {
  rescue: 'bg-au-success',
  fight: 'bg-au-amber',
  split: 'bg-au-teal',
  perfect: 'bg-au-success',
}

function calcTotalLoss(positionIds: string[]): number {
  return positionIds.reduce((sum, id) => {
    const pos = KCHECK_POSITIONS.find((p) => p.id === id)
    return sum + (pos ? pos.typicalEur : 0)
  }, 0)
}

const STEP_LABELS = ['1 · Positionen', '2 · Situation', '3 · Ihr Weg']

function isExternal(href: string) {
  return /^https?:/.test(href)
}

function Cta({
  href,
  children,
  variant,
}: {
  href: string
  children: React.ReactNode
  variant: 'primary' | 'secondary'
}) {
  const cls =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 rounded-ios-sm bg-au-amber px-6 py-3 text-[15px] font-semibold text-au-surface transition-opacity hover:opacity-90'
      : 'inline-flex items-center gap-2 rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-6 py-3 text-[15px] font-semibold text-au-ink transition-colors hover:border-au-amber'
  if (isExternal(href)) {
    return (
      <a href={href} rel="noopener" target="_blank" className={cls}>
        {children}
      </a>
    )
  }
  return (
    <Link href={href} className={cls}>
      {children}
    </Link>
  )
}

export function KuerzungsChecker() {
  const [state, setState] = useState<State>(DEFAULT_STATE)
  const firedRef = useRef(false)

  // localStorage erst nach Mount lesen (kein Hydration-Mismatch).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<State>
        setState({
          step: parsed.step ?? 1,
          positions: parsed.positions ?? [],
          situation: parsed.situation ?? null,
        })
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
    setState(DEFAULT_STATE)
  }

  const totalLoss = calcTotalLoss(state.positions)
  const situation: KCheckSituation | undefined = KCHECK_SITUATIONS.find((s) => s.id === state.situation)

  useEffect(() => {
    if (state.step === 3 && situation && !firedRef.current) {
      firedRef.current = true
      trackToolComplete('kuerzungs-checker')
    } else if (state.step !== 3) {
      firedRef.current = false
    }
  }, [state.step, situation])

  function togglePosition(id: string) {
    const has = state.positions.includes(id)
    const positions = has ? state.positions.filter((p) => p !== id) : [...state.positions, id]
    persist({ ...state, positions })
  }

  return (
    <div className="rounded-ios-md border border-au-sand-dark bg-au-surface p-6 sm:p-7">
      <div className="mb-4">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-au-amber-dark">
          Kürzungs-Checker · 5 Situationen
        </p>
        <h2 className="mt-1 font-display text-2xl font-bold leading-tight text-au-ink">
          Hat die Versicherung gekürzt? · Wir zeigen den richtigen Weg.
        </h2>
      </div>

      <ol
        aria-label="Fortschritts-Anzeige · 3 Schritte"
        className="mb-4 flex list-none gap-2 p-0 font-mono text-[11px] uppercase tracking-wider"
      >
        {STEP_LABELS.map((l, i) => {
          const active = state.step === i + 1
          return (
            <li
              key={l}
              aria-current={active ? 'step' : undefined}
              className={`rounded-ios-sm px-3 py-1.5 ${active ? 'bg-au-ink text-au-surface' : 'bg-au-paper-warm text-au-ink-soft'}`}
            >
              {l}
            </li>
          )
        })}
      </ol>

      {/* ── Schritt 1 · Positionen ─────────────────────────────────────── */}
      {state.step === 1 ? (
        <div>
          <p className="mb-3.5 text-[15px] leading-relaxed text-au-ink-soft">
            Was hat die gegnerische Versicherung in Ihrer Schadensregulierung gekürzt oder gestrichen?{' '}
            <strong>Mehrfachauswahl möglich.</strong>
          </p>
          <div className="flex flex-col gap-2">
            {KCHECK_POSITIONS.map((p) => {
              const checked = state.positions.includes(p.id)
              return (
                <label
                  key={p.id}
                  className={`flex cursor-pointer items-center rounded-ios-sm border-[1.5px] p-3.5 transition-colors ${checked ? 'border-au-amber bg-au-amber-light/40' : 'border-au-sand-dark bg-au-paper-warm'}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePosition(p.id)}
                    className="mr-3 h-[18px] w-[18px] accent-au-amber"
                  />
                  <span className="flex-1 text-[15px] text-au-ink">
                    <strong>{p.label}</strong> · typisch {p.typicalEur} € · BGH {p.bgh}
                  </span>
                </label>
              )
            })}
          </div>

          {totalLoss > 0 ? (
            <div className="mt-4 rounded-ios-sm bg-au-ink p-4 text-au-surface">
              <p className="font-mono text-[11px] uppercase tracking-wider text-au-amber-soft">
                Bisher erkannte Position(en)
              </p>
              <p className="mt-1 font-display text-3xl font-extrabold">
                {totalLoss.toLocaleString('de-DE')} €
              </p>
              <p className="mt-1 text-sm text-au-surface/70">
                {state.positions.length} Position(en) ausgewählt · Erfahrungswerte aus der Praxis
              </p>
            </div>
          ) : null}

          <button
            type="button"
            disabled={!totalLoss}
            onClick={() => persist({ ...state, step: 2 })}
            className="mt-4 inline-flex items-center gap-2 rounded-ios-sm bg-au-amber px-6 py-3 text-[15px] font-semibold text-au-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Weiter · Situation prüfen →
          </button>
        </div>
      ) : null}

      {/* ── Schritt 2 · Situation ──────────────────────────────────────── */}
      {state.step === 2 ? (
        <div>
          <p className="mb-3.5 text-[15px] leading-relaxed text-au-ink-soft">
            Auf welcher Basis wurde Ihr Schaden reguliert? <strong>Eine Auswahl genügt.</strong>
          </p>
          <div className="flex flex-col gap-2.5">
            {KCHECK_SITUATIONS.map((s) => {
              const active = state.situation === s.id
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => persist({ ...state, situation: s.id })}
                  className={`flex items-center justify-between gap-3 rounded-ios-sm border-[1.5px] p-3.5 text-left transition-colors ${active ? 'border-au-amber bg-au-amber-light/40' : 'border-au-sand-dark bg-au-paper-warm hover:border-au-amber'}`}
                >
                  <span className="text-[15px] text-au-ink">
                    <strong>{s.label}</strong>
                  </span>
                  <span aria-hidden className="text-au-amber-dark">
                    →
                  </span>
                </button>
              )
            })}
          </div>
          <div className="mt-4 flex gap-2.5">
            <button
              type="button"
              onClick={() => persist({ ...state, step: 1 })}
              className="inline-flex items-center gap-2 rounded-ios-sm border-[1.5px] border-au-sand-dark bg-au-surface px-6 py-3 text-[15px] font-semibold text-au-ink transition-colors hover:border-au-amber"
            >
              ← Zurück
            </button>
            <button
              type="button"
              disabled={!state.situation}
              onClick={() => persist({ ...state, step: 3 })}
              className="inline-flex items-center gap-2 rounded-ios-sm bg-au-amber px-6 py-3 text-[15px] font-semibold text-au-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Ergebnis anzeigen →
            </button>
          </div>
        </div>
      ) : null}

      {/* ── Schritt 3 · Ergebnis ───────────────────────────────────────── */}
      {state.step === 3 ? (
        situation ? (
          <div>
            <div className={`rounded-ios-sm p-4 text-au-surface ${TONE_BG[situation.tone]}`}>
              <p className="font-mono text-[11px] uppercase tracking-wider opacity-90">
                Situation {situation.id} · {situation.label}
              </p>
              <p className="mt-1 font-display text-xl font-bold">{situation.headline}</p>
              <p
                className="mt-2 text-sm leading-relaxed opacity-95 [&_strong]:font-bold"
                dangerouslySetInnerHTML={{ __html: situation.body }}
              />
            </div>

            {totalLoss > 0 ? (
              <div className="mt-3 rounded-ios-sm bg-au-ink p-4 text-au-surface">
                <p className="font-mono text-[11px] uppercase tracking-wider text-au-amber-soft">
                  Ihnen entgehen typischerweise
                </p>
                <p className="mt-1 font-display text-3xl font-extrabold">
                  {totalLoss.toLocaleString('de-DE')} €
                </p>
                <p className="mt-1 text-sm text-au-surface/70">
                  Erfahrungs-Mittel für:{' '}
                  {state.positions
                    .map((id) => KCHECK_POSITIONS.find((p) => p.id === id)?.label ?? id)
                    .join(', ')}
                </p>
              </div>
            ) : null}

            <div className="mt-3 rounded-ios-sm border border-au-sand-dark bg-au-paper-warm p-4">
              <p className="mb-2 font-mono text-[11px] font-semibold uppercase tracking-wider text-au-ink-soft">
                Was Sie durch den richtigen Weg gewinnen
              </p>
              <div className="space-y-1.5 text-sm text-au-ink-soft">
                <p>
                  <strong className="text-au-ink">Finanziell:</strong> {situation.valueAdd.financial}
                </p>
                <p>
                  <strong className="text-au-ink">Zeitlich:</strong> {situation.valueAdd.time}
                </p>
                <p>
                  <strong className="text-au-ink">Emotional:</strong> {situation.valueAdd.emotional}
                </p>
                <p>
                  <strong className="text-au-ink">Kosten für Sie:</strong> 0 € (§249 BGB)
                </p>
              </div>
            </div>

            <p className="mt-3 text-[13px] leading-relaxed text-au-muted">
              <strong className="text-au-ink-soft">Schätzung.</strong> Die genannten Beträge sind
              Erfahrungswerte aus der Mandanten-Praxis. Im Einzelfall können die Werte abweichen — der
              konkrete Anspruch wird durch ein unabhängiges Gutachten oder eine anwaltliche Prüfung
              ermittelt.
            </p>

            <div className="mt-3.5 flex flex-wrap gap-2.5">
              <Cta href={situation.ctaPrimary.href} variant="primary">
                {situation.ctaPrimary.label} →
              </Cta>
              <Cta href={situation.ctaSecondary.href} variant="secondary">
                {situation.ctaSecondary.label}
              </Cta>
            </div>

            <button
              type="button"
              onClick={() => persist({ ...state, step: 2 })}
              className="mt-2.5 text-sm font-semibold text-au-ink-soft underline"
            >
              ← Situation ändern
            </button>
          </div>
        ) : (
          <p className="text-au-ink-soft">Bitte Schritt 2 abschließen.</p>
        )
      ) : null}

      <button
        type="button"
        onClick={reset}
        className="mt-4 block text-sm font-semibold text-au-ink-soft underline"
      >
        ↺ Neu starten
      </button>
    </div>
  )
}
