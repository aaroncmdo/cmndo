'use client'

// AAR-769 Phase 4: Web-Implementierung von <Input>.
// Liquid-Glass-Stil: tint-bg (navy/[0.06]) → focus-bg-white + ondo-Border + focus-shadow.

import type { ChangeEvent } from 'react'
import type { InputProps, InputSize } from './Input.types'
import { tokens } from '@/lib/design-tokens'

const heightMap: Record<InputSize, number> = {
  sm: 40,
  md: tokens.touchMin, // 44
  lg: 52,
}

const fontSizeMap: Record<InputSize, number> = {
  sm: 14,
  md: 16,
  lg: 16,
}

export function Input({
  value,
  onChangeText,
  onChange,
  inputType = 'text',
  placeholder,
  disabled,
  size = 'md',
  fullWidth = true,
  min,
  max,
  name,
  ariaLabel,
  className,
  autoFocus,
  required,
  maxLength,
  pattern,
}: InputProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChangeText(e.target.value)
    onChange?.(e)
  }

  return (
    <input
      type={inputType}
      value={value}
      onChange={handleChange}
      placeholder={placeholder}
      disabled={disabled}
      min={min}
      max={max}
      name={name}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      required={required}
      maxLength={maxLength}
      pattern={pattern}
      className={[
        fullWidth ? 'w-full' : '',
        'bg-claimondo-navy/[0.06] border-[1.5px] border-transparent rounded-2xl px-4',
        'text-claimondo-navy tracking-[-.01em] placeholder:text-[#8a93a6]',
        'transition-all duration-200 ease-[cubic-bezier(.32,.72,0,1)]',
        'hover:bg-claimondo-navy/[0.08]',
        'focus:outline-none focus:bg-white focus:border-claimondo-ondo focus:shadow-focus-ondo',
        'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-claimondo-navy/[0.06]',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        height: heightMap[size],
        fontSize: fontSizeMap[size],
      }}
    />
  )
}
