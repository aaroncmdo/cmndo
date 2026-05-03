// @ts-expect-error RN optional
import { View } from 'react-native'
import { tokens } from '@/lib/design-tokens'
import type { RowProps } from './Row.types'

const alignMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  stretch: 'stretch',
  baseline: 'baseline',
} as const
const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
} as const

export function Row({ children, gap, p, px, py, bg, radius, align, justify, wrap }: RowProps) {
  const style = {
    flexDirection: 'row' as const,
    flexWrap: wrap ? ('wrap' as const) : ('nowrap' as const),
    gap: gap !== undefined ? tokens.spacing[gap] : undefined,
    padding: p !== undefined ? tokens.spacing[p] : undefined,
    paddingHorizontal: px !== undefined ? tokens.spacing[px] : undefined,
    paddingVertical: py !== undefined ? tokens.spacing[py] : undefined,
    backgroundColor: bg ? tokens.colors[bg] : undefined,
    borderRadius: radius ? tokens.radius[radius] : undefined,
    alignItems: align ? alignMap[align] : undefined,
    justifyContent: justify ? justifyMap[justify] : undefined,
  }
  return <View style={style}>{children}</View>
}
