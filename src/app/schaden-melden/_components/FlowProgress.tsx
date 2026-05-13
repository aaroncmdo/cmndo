import { getTranslations } from 'next-intl/server'

// AAR-467 C1: Progress-Bar für den Kunden-Flow. 4 Steps, aktueller Step
// und alle davor werden als "aktiv" markiert. Server-Component —
// erhält die Step-Zahl als Prop.
//
// 2026-05-11 (kitta/aar-polish-flows): iOS-Glass Step-Rail nach
// Brief §8.6 — Circle + Connector-Line + Labels, active = ondo mit
// Halo-Shadow, done = navy mit Check-Icon, idle = white + thin border.

type Props = { current: 1 | 2 | 3 | 4 }

const STEPS: Array<{ num: 1 | 2 | 3 | 4; key: 'step1' | 'step2' | 'step3' | 'step4' }> = [
  { num: 1, key: 'step1' },
  { num: 2, key: 'step2' },
  { num: 3, key: 'step3' },
  { num: 4, key: 'step4' },
]

export async function FlowProgress({ current }: Props) {
  const t = await getTranslations('flow.progress')
  const progress = ((current - 1) / (STEPS.length - 1)) * 100

  return (
    <nav
      aria-label={t('aria_label')}
      className="relative rounded-[28px] bg-white px-5 py-5 sm:px-7 sm:py-6 shadow-claimondo-md"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute left-[11%] right-[11%] top-[36px] sm:top-[40px] h-[3px] rounded-full bg-claimondo-navy/[0.06]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[11%] top-[36px] sm:top-[40px] h-[3px] rounded-full bg-gradient-to-r from-claimondo-navy to-claimondo-ondo transition-[width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
        style={{ width: `${(progress / 100) * 78}%` }}
      />
      <ol className="relative z-10 grid grid-cols-4">
        {STEPS.map((s) => {
          const isDone = s.num < current
          const isCurrent = s.num === current
          return (
            <li
              key={s.num}
              className="flex flex-col items-center text-center"
              aria-current={isCurrent ? 'step' : undefined}
            >
              <span
                className={[
                  'inline-grid h-9 w-9 sm:h-10 sm:w-10 place-items-center rounded-full border-2 text-[13px] sm:text-[15px] font-semibold tracking-[-.01em] transition-all duration-300 ease-[cubic-bezier(.32,.72,0,1)]',
                  isDone
                    ? 'bg-claimondo-navy border-claimondo-navy text-white scale-[1.04]'
                    : isCurrent
                      ? 'bg-claimondo-ondo border-claimondo-ondo text-white scale-[1.06] shadow-[0_0_0_6px_rgba(69,115,162,.16)]'
                      : 'bg-white border-claimondo-navy/[0.10] text-claimondo-ondo/60',
                ].join(' ')}
              >
                {isDone ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
                    <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  s.num
                )}
              </span>
              <span
                className={[
                  'mt-3 text-[11px] sm:text-xs tracking-[-.005em] transition-colors duration-200',
                  isCurrent
                    ? 'font-semibold text-claimondo-navy'
                    : isDone
                      ? 'font-medium text-claimondo-ondo/80'
                      : 'font-medium text-claimondo-ondo/60',
                ].join(' ')}
              >
                {t(s.key)}
              </span>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
