'use client'

// Touch-friendly Filter-Chip + Tab-Toggle (Portal-Review C3).
// Tap-Target = 44px Höhe (iOS HIG). Optional `count` für Filter-Anzahl.
// `<ChipRow>` umrahmt eine horizontal scrollbare Reihe mit Snap.

import Link from 'next/link'
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'

export type ChipVariant = 'default' | 'selected' | 'ghost'

const BASE_CLS =
  'inline-flex items-center justify-center gap-1.5 min-h-11 px-3.5 rounded-full text-sm font-medium leading-tight whitespace-nowrap transition-colors snap-start focus:outline-none focus-visible:ring-2 focus-visible:ring-claimondo-ondo focus-visible:ring-offset-1'

const VARIANT_CLS: Record<ChipVariant, string> = {
  default:
    'bg-white border border-claimondo-border text-claimondo-ondo hover:bg-[#f8f9fb] hover:text-claimondo-navy',
  selected: 'bg-claimondo-navy text-white border border-claimondo-navy',
  ghost:
    'bg-transparent text-claimondo-ondo hover:bg-[#f8f9fb] hover:text-claimondo-navy',
}

function ChipBody({
  children,
  count,
  variant,
}: {
  children: ReactNode
  count?: number
  variant: ChipVariant
}) {
  if (count == null) return <>{children}</>
  return (
    <>
      {children}
      <span
        className={
          variant === 'selected'
            ? 'text-white/80 tabular-nums'
            : 'text-claimondo-ondo/70 tabular-nums'
        }
      >
        {count}
      </span>
    </>
  )
}

type CommonProps = {
  variant?: ChipVariant
  count?: number
  className?: string
}

type ChipButtonProps = CommonProps &
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className'> & {
    href?: undefined
  }

type ChipLinkProps = CommonProps &
  Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'className' | 'href'> & {
    href: string
  }

export type ChipProps = ChipButtonProps | ChipLinkProps

export const Chip = forwardRef<HTMLElement, ChipProps>(function Chip(
  props,
  ref,
) {
  const { variant = 'default', count, className = '', children, ...rest } = props
  const cls = `${BASE_CLS} ${VARIANT_CLS[variant]} ${className}`

  if ('href' in props && props.href != null) {
    const { href, ...anchorRest } = rest as AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }
    return (
      <Link
        ref={ref as React.Ref<HTMLAnchorElement>}
        href={href}
        className={cls}
        {...anchorRest}
      >
        <ChipBody count={count} variant={variant}>
          {children}
        </ChipBody>
      </Link>
    )
  }

  const buttonRest = rest as ButtonHTMLAttributes<HTMLButtonElement>
  return (
    <button
      ref={ref as React.Ref<HTMLButtonElement>}
      type={buttonRest.type ?? 'button'}
      className={cls}
      {...buttonRest}
    >
      <ChipBody count={count} variant={variant}>
        {children}
      </ChipBody>
    </button>
  )
})

export function ChipRow({
  children,
  className = '',
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={`flex gap-2 overflow-x-auto snap-x snap-mandatory pb-1 -mx-4 px-4 [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {children}
    </div>
  )
}
