'use client'
import { createElement } from 'react'
import { tokens } from '@/lib/design-tokens'
import type { TextProps } from './Text.types'

export function Text({
  children,
  variant = 'body',
  color = 'navy',
  align,
  as = 'span',
  truncate,
  numberOfLines,
}: TextProps) {
  const typo = tokens.typo[variant]

  const style: React.CSSProperties = {
    color: tokens.colors[color],
    fontSize: typo.size,
    lineHeight: `${typo.lineHeight}px`,
    fontWeight: typo.weight,
    textAlign: align,
    margin: 0,
    letterSpacing: 'letterSpacing' in typo ? typo.letterSpacing : undefined,
    textTransform: 'textTransform' in typo ? typo.textTransform : undefined,
    ...(truncate
      ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
      : undefined),
    ...(numberOfLines
      ? {
          display: '-webkit-box',
          WebkitLineClamp: numberOfLines,
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
        }
      : undefined),
  }

  return createElement(as, { style }, children)
}
