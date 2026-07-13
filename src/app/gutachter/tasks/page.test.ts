import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Source-guard: Gutachter task cards use ClickableItemRow (Task 3 — A1 slice).
// Mirrors the pattern in src/app/api/cron/send-lead-reminders/route.test.ts.
describe('gutachter/tasks/page — ClickableItemRow integration', () => {
  const src = readFileSync('src/app/gutachter/tasks/page.tsx', 'utf8')

  it('imports ClickableItemRow from the shared wrapper', () => {
    expect(src).toContain('ClickableItemRow')
  })

  it('wraps task cards with ClickableItemRow (href navigates to the Fall)', () => {
    // The wrapper must be used with a href pointing at the fall detail route.
    expect(src).toContain('/gutachter/fall/${task.fall_id}')
    expect(src).toContain('<ClickableItemRow')
  })
})
