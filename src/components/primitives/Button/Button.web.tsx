'use client'

// AAR-769 Phase 2: Web-Implementierung von <Button>.
// Hover-Feedback via useState + onMouseEnter/Leave (kein CSS-Modul).

import { useState } from 'react'
import { tokens } from '@/lib/design-tokens'
import type { ButtonProps, ButtonSize, ButtonTone } from './Button.types'
import { resolveButtonProps } from './Button.logic'

// Custom: rose-700 für danger-hover (kein Token-Eintrag, lokale Konstante).
const DANGER_HOVER = '#be123c'
const SUCCESS_HOVER = '#059669' // emerald-600
const GHOST_HOVER_BG = tokens.cssColors.bg

const heightMap: Record<ButtonSize, number> = {
  sm: 36,
  md: tokens.touchMin, // 44
  lg: 52,
  icon: tokens.touchMin, // 44 — quadratisch (Icon-only)
}

const fontSizeMap: Record<ButtonSize, number> = {
  sm: 13,
  md: 14,
  lg: 16,
  icon: 14,
}

type ToneStyle = {
  bg: string
  bgHover: string
  text: string
  border?: string
}

const toneMap: Record<ButtonTone, ToneStyle> = {
  navy: {
    bg: tokens.cssColors.navy,
    bgHover: tokens.cssColors.shield,
    text: tokens.colors.white,
  },
  ondo: {
    bg: tokens.cssColors.ondo,
    bgHover: tokens.cssColors.navy,
    text: tokens.colors.white,
  },
  ghost: {
    bg: 'transparent',
    bgHover: GHOST_HOVER_BG,
    text: tokens.cssColors.navy,
    border: tokens.cssColors.border,
  },
  bare: {
    bg: 'transparent',
    bgHover: GHOST_HOVER_BG,
    text: tokens.cssColors.navy,
  },
  danger: {
    bg: tokens.colors.danger,
    bgHover: DANGER_HOVER,
    text: tokens.colors.white,
  },
  success: {
    bg: tokens.colors.success,
    bgHover: SUCCESS_HOVER,
    text: tokens.colors.white,
  },
}

export function Button(props: ButtonProps) {
  const { children, size = 'md', iconLeft, iconRight, fullWidth, type = 'button', className, ariaLabel } = props
  const [hover, setHover] = useState(false)
  const { tone, handler, isDisabled, loading } = resolveButtonProps(props)
  const t = toneMap[tone]
  const isIcon = size === 'icon'

  const style: React.CSSProperties = {
    boxSizing: 'border-box',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing[2],
    height: heightMap[size],
    width: isIcon ? heightMap.icon : fullWidth ? '100%' : undefined,
    paddingLeft: isIcon ? 0 : tokens.spacing[4],
    paddingRight: isIcon ? 0 : tokens.spacing[4],
    borderRadius: tokens.radius.sm,
    backgroundColor: hover && !isDisabled ? t.bgHover : t.bg,
    color: t.text,
    border: t.border ? `1px solid ${t.border}` : 'none',
    fontSize: fontSizeMap[size],
    fontWeight: 600,
    lineHeight: 1,
    cursor: isDisabled ? 'not-allowed' : 'pointer',
    opacity: isDisabled ? 0.5 : 1,
    transition: 'background-color 120ms ease',
  }

  const spinner = (
    <span
      aria-hidden
      style={{
        width: fontSizeMap[size],
        height: fontSizeMap[size],
        border: `2px solid ${t.text}`,
        borderTopColor: 'transparent',
        borderRadius: '50%',
        display: 'inline-block',
        animation: 'cmdo-btn-spin 700ms linear infinite',
      }}
    />
  )

  return (
    <button
      type={type}
      style={style}
      className={['cmdo-btn', className].filter(Boolean).join(' ')}
      aria-label={ariaLabel}
      aria-busy={loading || undefined}
      onClick={isDisabled ? undefined : handler}
      disabled={isDisabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {loading ? spinner : iconLeft}
      {!isIcon && children}
      {isIcon && !loading && children}
      {iconRight}
    </button>
  )
}
