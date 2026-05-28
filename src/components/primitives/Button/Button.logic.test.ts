import { describe, it, expect, vi } from 'vitest'
import { resolveButtonProps } from './Button.logic'

describe('resolveButtonProps', () => {
  it('variant bestimmt die Farbe, sonst navy', () => {
    expect(resolveButtonProps({ variant: 'ondo' }).tone).toBe('ondo')
    expect(resolveButtonProps({}).tone).toBe('navy')
  })
  it('onClick wird als handler durchgereicht', () => {
    const onClick = vi.fn()
    resolveButtonProps({ onClick }).handler?.()
    expect(onClick).toHaveBeenCalledOnce()
  })
  it('loading erzwingt isDisabled', () => {
    expect(resolveButtonProps({ loading: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({ disabled: true }).isDisabled).toBe(true)
    expect(resolveButtonProps({}).isDisabled).toBe(false)
  })
})
