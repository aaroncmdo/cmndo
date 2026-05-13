// AAR-769 Phase 4: Native-Implementierung von <Input>.
// Web-Liquid-Glass-Stil wird als tint-Background + Focus-Border-Highlight
// nachgebaut. `inputType` mapped auf RN keyboardType wo sinnvoll, sonst no-op.

// @ts-expect-error RN ist optional peer dep
import { TextInput } from 'react-native'
import { useState } from 'react'
import { tokens } from '@/lib/design-tokens'
import type { InputProps, InputSize, InputType } from './Input.types'

const heightMap: Record<InputSize, number> = {
  md: tokens.touchMin,
  lg: 52,
}

const fontSizeMap: Record<InputSize, number> = {
  md: 16,
  lg: 16,
}

// Best-effort Mapping Web inputType → RN keyboardType.
const keyboardTypeMap: Partial<Record<InputType, string>> = {
  email: 'email-address',
  tel: 'phone-pad',
  url: 'url',
  number: 'numeric',
  search: 'default',
}

function hexWithAlpha(hex: string, alpha: number): string {
  // tokens.colors.navy ist Hex (#0D1B3E) — als rgba mit alpha rendern.
  const h = hex.replace('#', '')
  const r = parseInt(h.substring(0, 2), 16)
  const g = parseInt(h.substring(2, 4), 16)
  const b = parseInt(h.substring(4, 6), 16)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

export function Input({
  value,
  onChangeText,
  inputType = 'text',
  placeholder,
  disabled,
  size = 'md',
  fullWidth = true,
  ariaLabel,
  autoFocus,
}: InputProps) {
  const [focused, setFocused] = useState(false)

  const bg = focused
    ? tokens.colors.white
    : hexWithAlpha(tokens.colors.navy, 0.06)

  const borderColor = focused ? tokens.colors.ondo : 'transparent'

  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      editable={!disabled}
      autoFocus={autoFocus}
      accessibilityLabel={ariaLabel}
      keyboardType={keyboardTypeMap[inputType] ?? 'default'}
      secureTextEntry={inputType === 'password'}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholderTextColor={hexWithAlpha(tokens.colors.navy, 0.4)}
      style={{
        height: heightMap[size],
        fontSize: fontSizeMap[size],
        backgroundColor: bg,
        borderWidth: 1.5,
        borderColor,
        borderRadius: 16,
        paddingHorizontal: tokens.spacing[4],
        color: tokens.colors.navy,
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        opacity: disabled ? 0.5 : 1,
      }}
    />
  )
}
