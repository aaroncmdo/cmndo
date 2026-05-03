'use client'
import { tokens } from '@/lib/design-tokens'
import type { StackProps } from './Stack.types'

const alignMap = { start: 'flex-start', center: 'center', end: 'flex-end', stretch: 'stretch' } as const
const justifyMap = {
  start: 'flex-start',
  center: 'center',
  end: 'flex-end',
  between: 'space-between',
  around: 'space-around',
} as const

export function Stack({ children, gap, p, px, py, bg, radius, align, justify }: StackProps) {
  const style: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    gap: gap !== undefined ? tokens.spacing[gap] : undefined,
    padding: p !== undefined ? tokens.spacing[p] : undefined,
    paddingLeft: px !== undefined ? tokens.spacing[px] : undefined,
    paddingRight: px !== undefined ? tokens.spacing[px] : undefined,
    paddingTop: py !== undefined ? tokens.spacing[py] : undefined,
    paddingBottom: py !== undefined ? tokens.spacing[py] : undefined,
    backgroundColor: bg ? tokens.colors[bg] : undefined,
    borderRadius: radius ? tokens.radius[radius] : undefined,
    alignItems: align ? alignMap[align] : undefined,
    justifyContent: justify ? justifyMap[justify] : undefined,
  }
  return <div style={style}>{children}</div>
}
