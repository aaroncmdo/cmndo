'use client'

import { Loader2 } from 'lucide-react'
import { forwardRef } from 'react'
import { Button } from './button'

// BUG-88: Wrapper um shadcn/ui Button mit konsistentem Loading-State.
//
// Pattern für jeden async Submit:
//   const [isPending, startTransition] = useTransition()
//   <LoadingButton isLoading={isPending}>Speichern</LoadingButton>
//
// Wenn isLoading=true: disabled + Spinner-Icon + loadingText (default
// 'Speichere...'). children werden in dem Fall NICHT gerendert.
// Wenn isLoading=false: normales children + ggf. disabled aus props.

type ButtonElementProps = React.ButtonHTMLAttributes<HTMLButtonElement>

type LoadingButtonProps = ButtonElementProps & {
  isLoading?: boolean
  loadingText?: string
}

export const LoadingButton = forwardRef<HTMLButtonElement, LoadingButtonProps>(
  function LoadingButton(
    { isLoading = false, loadingText = 'Speichere...', children, disabled, className, ...rest },
    ref,
  ) {
    const isDisabled = disabled || isLoading
    return (
      <button
        ref={ref}
        type={rest.type ?? 'button'}
        disabled={isDisabled}
        aria-busy={isLoading || undefined}
        className={className}
        {...rest}
      >
        {isLoading ? (
          <span className="inline-flex items-center justify-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
            <span>{loadingText}</span>
          </span>
        ) : (
          children
        )}
      </button>
    )
  },
)

// Re-export shadcn Button so consumers can grab both from a single import
// path if they want — useful in files that already import LoadingButton.
export { Button }
