import { readFileSync } from 'node:fs'
import { describe, it, expect } from 'vitest'

// Struktur-Test (analog golden-path route.test.ts): sichert die Sicherheits-Invarianten des
// Janitors gegen versehentliche Regression, ohne die echte Prod-DB zu treffen.
describe('purge-test-data — Sicherheits-Invarianten', () => {
  const lib = readFileSync('src/lib/health/purge-test-data.ts', 'utf8')
  const route = readFileSync('src/app/api/cron/purge-test-data/route.ts', 'utf8')

  it('nutzt delete_fall_komplett fuer fall-scoped Cleanup UND loescht die Claim-Row direkt', () => {
    expect(lib).toMatch(/delete_fall_komplett/)
    expect(lib).toMatch(/from\('claims'\)\s*\.delete\(\)\s*\.eq\('id'/)
  })

  it('raeumt die NO_ACTION-Lead-FK, die den ersten Lauf blockte (gutachter_finder_anfragen)', () => {
    expect(lib).toMatch(/gutachter_finder_anfragen/)
    expect(lib).toMatch(/konvertiert_zu_lead_id/)
  })

  it('loescht NIE Accounts (keine deletes auf sachverstaendige/profiles/auth)', () => {
    expect(lib).not.toMatch(/from\('sachverstaendige'\)\s*\.delete\(/)
    expect(lib).not.toMatch(/from\('profiles'\)\s*\.delete\(/)
    expect(lib).not.toMatch(/auth\.admin\.deleteUser/)
  })

  it('hat einen Recency-Guard (72h)', () => {
    expect(lib).toMatch(/RECENCY_MS/)
    expect(lib).toMatch(/72 \* 60 \* 60 \* 1000/)
  })

  it('sammelt Delete-Fehler statt zu werfen (leads/claims.delete-Error -> errors)', () => {
    expect(lib).toMatch(/errors\.push\(`leads\.delete/)
    expect(lib).toMatch(/errors\.push\(`claims\.delete/)
  })

  it('Route ist CRON_SECRET-gated und dryRun-default (Delete nur mit Confirm-Token)', () => {
    expect(route).toMatch(/CRON_SECRET/)
    expect(route).toMatch(/401/)
    expect(route).toMatch(/const dryRun = confirm !== 'DELETE-TESTDATA'/)
  })
})
