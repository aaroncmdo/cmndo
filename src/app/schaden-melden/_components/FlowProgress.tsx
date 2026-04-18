import { getTranslations } from 'next-intl/server'

// AAR-467 C1: Progress-Bar für den Kunden-Flow. 4 Steps, aktueller Step
// und alle davor werden als "aktiv" markiert. Server-Component —
// erhält die Step-Zahl als Prop.

type Props = { current: 1 | 2 | 3 | 4 }

const STEPS: Array<{ num: 1 | 2 | 3 | 4; key: 'step1' | 'step2' | 'step3' | 'step4' }> = [
  { num: 1, key: 'step1' },
  { num: 2, key: 'step2' },
  { num: 3, key: 'step3' },
  { num: 4, key: 'step4' },
]

export async function FlowProgress({ current }: Props) {
  const t = await getTranslations('flow.progress')

  return (
    <nav aria-label={t('aria_label')} className="flex items-center gap-2">
      {STEPS.map((s, idx) => {
        const isActive = s.num <= current
        const isCurrent = s.num === current
        return (
          <div key={s.num} className="flex flex-1 items-center gap-2">
            <div
              className={[
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                isActive ? 'bg-claimondo-ondo text-white' : 'bg-claimondo-border text-slate-500',
                isCurrent ? 'ring-2 ring-claimondo-ondo ring-offset-2' : '',
              ].join(' ')}
              aria-current={isCurrent ? 'step' : undefined}
            >
              {s.num}
            </div>
            <span
              className={[
                'hidden text-sm sm:inline',
                isActive ? 'text-claimondo-navy font-medium' : 'text-slate-500',
              ].join(' ')}
            >
              {t(s.key)}
            </span>
            {idx < STEPS.length - 1 ? (
              <div
                className={[
                  'hidden h-px flex-1 sm:block',
                  s.num < current ? 'bg-claimondo-ondo' : 'bg-claimondo-border',
                ].join(' ')}
                aria-hidden
              />
            ) : null}
          </div>
        )
      })}
    </nav>
  )
}
