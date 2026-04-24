import { cn } from '@/lib/utils'

// AAR-463 F5: Horizontal-Stepper mit done/active/todo-States.
// Pulse-Animation auf `active` nutzt die Keyframes aus globals.css.
export type StepperStep = {
  label: string
  status: 'done' | 'active' | 'todo'
}

type Props = {
  steps: StepperStep[]
  className?: string
  /** Aria-Label für die gesamte Stepper-Liste. */
  label?: string
}

export function StepperProgress({ steps, className, label = 'Fortschritt' }: Props) {
  return (
    <ol
      aria-label={label}
      className={cn('flex items-center gap-2', className)}
    >
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1
        const stepNumber = i + 1
        return (
          <li
            key={`${i}-${step.label}`}
            aria-current={step.status === 'active' ? 'step' : undefined}
            className="flex min-w-0 flex-1 items-center"
          >
            <div className="flex min-w-0 items-center gap-2">
              <div
                className={cn(
                  'flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                  step.status === 'done' && 'bg-claimondo-ondo text-white',
                  step.status === 'active' &&
                    'animate-stepper-pulse bg-claimondo-navy text-white',
                  step.status === 'todo' && 'bg-claimondo-border text-claimondo-ondo',
                )}
                aria-hidden="true"
              >
                {step.status === 'done' ? '✓' : stepNumber}
              </div>
              <span
                className={cn(
                  'truncate text-sm',
                  step.status === 'active'
                    ? 'font-semibold text-claimondo-navy'
                    : 'text-claimondo-ondo',
                )}
              >
                {step.label}
              </span>
            </div>
            {!isLast && (
              <div
                aria-hidden="true"
                className="mx-2 h-px flex-1 bg-claimondo-border"
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}
