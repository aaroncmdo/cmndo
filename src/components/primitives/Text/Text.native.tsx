// @ts-expect-error RN optional
import { Text as RNText } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { TextProps } from './Text.types'

export function Text({
  children,
  variant = 'body',
  color = 'navy',
  align,
  truncate,
  numberOfLines,
}: TextProps) {
  const typo = tokens.typo[variant]

  const style = {
    color: tokens.colors[color],
    fontSize: typo.size,
    lineHeight: typo.lineHeight,
    fontWeight: typo.weight,
    textAlign: align,
    letterSpacing: 'letterSpacing' in typo ? typo.letterSpacing : undefined,
    textTransform: 'textTransform' in typo ? typo.textTransform : undefined,
  }

  // RN behandelt truncate über numberOfLines + ellipsizeMode
  return (
    <RNText
      style={style}
      numberOfLines={numberOfLines ?? (truncate ? 1 : undefined)}
      ellipsizeMode="tail"
    >
      {children}
    </RNText>
  )
}
