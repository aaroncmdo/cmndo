import { describe, it, expect, vi } from 'vitest'
import { resolveButtonProps } from './Button.logic'

describe('resolveButtonProps', () => {
  it('variant gewinnt ueber tone, sonst tone, sonst navy', () => {
    expect(resolveButtonProps({ variant: 'ondo', tone: 'danger' }).tone).toBe('ondo')
    expect(resolveButtonProps({ tone: 'danger' }).tone).toBe('danger')
    expect(resolveButtonProps({}).tone).toBe('navy')
  })
  it('onClick gewinnt ueber onPress', () => {
    const onClick = vi.fn()
    const onPress = vi.fn()
    resolveButtonProps({ onClick, onPress }).handler?.()
    expect(onClick).toHaveBeenCalledOnce()
    expect(onPress).not.toHaveBeenCalled()
  })
  it('loading erzwingt isDisabled', () => {
    expect(resolveButtonProps({ loading: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({ disabled: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({}).isDisabled).toBe(false)
  })
})
