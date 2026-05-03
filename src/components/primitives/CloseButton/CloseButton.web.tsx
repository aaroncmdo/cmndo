'use client'
import { XIcon } from 'lucide-react'
import { useState } from 'react'
import { tokens } from '@/lib/design-tokens'
import type { CloseButtonProps } from './CloseButton.types'

export function CloseButton({
  onPress,
  label = 'Schließen',
  offset = 16,
  position = 'absolute',
}: CloseButtonProps) {
  const [hover, setHover] = useState(false)
  return (
    <button
      type="button"
      onClick={onPress}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-label={label}
      style={{
        position,
        top: offset,
        right: offset,
        width: 40,
        height: 40,
        borderRadius: tokens.radius.full,
        backgroundColor: hover ? 'rgba(255,255,255,0.9)' : tokens.glass.light.bg,
        backdropFilter: `blur(${tokens.glass.light.blur}px)`,
        WebkitBackdropFilter: `blur(${tokens.glass.light.blur}px)`,
        border: `1px solid ${tokens.glass.light.border}`,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: 'pointer',
        boxShadow: tokens.shadow.md,
        zIndex: 50,
        padding: 0,
      }}
    >
      <XIcon size={16} style={{ color: tokens.colors.navy }} />
    </button>
  )
}
