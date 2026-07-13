import { describe, it, expect, afterEach } from 'vitest'
import { isExecutorEnabled } from './policy'

afterEach(() => { delete process.env.TASK_EXECUTOR_ENABLED })

describe('isExecutorEnabled', () => {
  it('false ohne ENV', () => { expect(isExecutorEnabled()).toBe(false) })
  it('true bei TASK_EXECUTOR_ENABLED=true', () => {
    process.env.TASK_EXECUTOR_ENABLED = 'true'
    expect(isExecutorEnabled()).toBe(true)
  })
  it('false bei anderem Wert', () => {
    process.env.TASK_EXECUTOR_ENABLED = '1'
    expect(isExecutorEnabled()).toBe(false)
  })
})
