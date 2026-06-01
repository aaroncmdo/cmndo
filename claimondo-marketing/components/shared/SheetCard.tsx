import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type Padding = 'none' | 'sm' | 'md' | 'lg'
type Size = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'full'

type SheetCardProps = {
  children: ReactNode
  className?: string
  padding?: Padding
  size?: Size
  animateIn?: boolean
  as?: 'div' | 'section' | 'article'
}

const PADDING_CLS: Record<Padding, string> = {
  none: '',
  sm: 'p-6',
  md: 'p-8',
  lg: 'p-10',
}

const SIZE_CLS: Record<Size, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  full: '',
}

/**
 * Wiederverwendbarer Sheet-Container fuer Modals, Bestaetigungs-Pages und
 * Wizard-Stufen. Liefert das Claimondo-Liquid-Glass-Sheet-Look mit den
 * Tokens rounded-claimondo-sheet + shadow-sheet und (optional) der
 * sheetIn-Eintritts-Animation.
 */
export function SheetCard({
  children,
  className,
  padding = 'lg',
  size = 'md',
  animateIn = true,
  as: As = 'div',
}: SheetCardProps) {
  return (
    <As
      className={cn(
        'bg-white rounded-claimondo-sheet shadow-sheet w-full',
        SIZE_CLS[size],
        PADDING_CLS[padding],
        animateIn && 'animate-[sheetIn_.42s_cubic-bezier(.16,1,.3,1)_both]',
        className,
      )}
    >
      {children}
    </As>
  )
}
