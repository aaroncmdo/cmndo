// TDD-Tests fuer config-required-env Health-Check.
// Spec: docs/superpowers/plans/2026-06-29-pipeline-observability.md §Task5
// Kein DB-Zugriff — check liest nur process.env.
//
// Getestete Faelle:
//   1. Alle gesetzt       -> ok,   metric=0
//   2. VAPID fehlt        -> warn, fehlende Keys im detail
//   3. KANZLEI aktiv, SF-Vars fehlen -> warn
//   4. Kein Email-Provider            -> crit
//   5. Kombination: kein Email + VAPID fehlt -> crit (Email dominiert)

import { describe, it, expect, afterEach, vi } from 'vitest'
import type { CheckCtx } from '@/lib/health/types'
import { configRequiredEnvCheck } from '../config-required-env'

// Dummy-ctx — wird vom Check nicht genutzt (kein DB-Zugriff)
const dummyCtx = {} as CheckCtx

// Basis-ENV: alle Pflicht-Keys gesetzt, KANZLEI deaktiviert
const BASE_ENV: Record<string, string> = {
  RESEND_API_KEY: 'resend-key-123',
  NEXT_PUBLIC_VAPID_PUBLIC_KEY: 'vapid-public-abc',
  VAPID_PRIVATE_KEY: 'vapid-private-xyz',
  KANZLEI_API_ENABLED: 'false',
}

function stubEnv(overrides: Record<string, string | undefined> = {}): void {
  // Zuerst Basis setzen
  for (const [k, v] of Object.entries(BASE_ENV)) {
    vi.stubEnv(k, v)
  }
  // Dann Ueberschreibungen anwenden (undefined = loeschen)
  for (const [k, v] of Object.entries(overrides)) {
    if (v === undefined) {
      // Variable entfernen: auf leeren String setzen und dann explizit leeren
      vi.stubEnv(k, '')
      delete process.env[k]
    } else {
      vi.stubEnv(k, v)
    }
  }
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('configRequiredEnvCheck', () => {
  it('hat korrekte id und category', () => {
    expect(configRequiredEnvCheck.id).toBe('config-required-env')
    expect(configRequiredEnvCheck.category).toBe('config')
  })

  it('liefert ok wenn alle Pflicht-ENV gesetzt (KANZLEI deaktiviert)', async () => {
    stubEnv()
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('ok')
    expect(result.metric).toBe(0)
    expect(result.detail).toBe('Alle Pflicht-ENV gesetzt.')
  })

  it('liefert ok wenn GMAIL statt RESEND gesetzt ist', async () => {
    stubEnv({ RESEND_API_KEY: undefined, GMAIL_SMTP_USER: 'mail@example.de' })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('ok')
  })

  // --- VAPID ---

  it('liefert warn wenn VAPID_PRIVATE_KEY fehlt', async () => {
    stubEnv({ VAPID_PRIVATE_KEY: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('VAPID_PRIVATE_KEY')
    expect(result.metric).toBeGreaterThan(0)
  })

  it('liefert warn wenn NEXT_PUBLIC_VAPID_PUBLIC_KEY fehlt', async () => {
    stubEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
  })

  it('liefert warn wenn beide VAPID-Keys fehlen', async () => {
    stubEnv({ NEXT_PUBLIC_VAPID_PUBLIC_KEY: undefined, VAPID_PRIVATE_KEY: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('NEXT_PUBLIC_VAPID_PUBLIC_KEY')
    expect(result.detail).toContain('VAPID_PRIVATE_KEY')
    expect(result.metric).toBe(2)
  })

  // --- KANZLEI_API_ENABLED='true' ---

  it('liefert ok wenn KANZLEI aktiv und alle SF-Vars gesetzt', async () => {
    stubEnv({
      KANZLEI_API_ENABLED: 'true',
      KANZLEI_SF_API_URL: 'https://sf.example.com',
      KANZLEI_SF_CLIENT_ID: 'client-id-abc',
      KANZLEI_SF_CLIENT_SECRET: 'secret-xyz',
    })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('ok')
  })

  it('liefert warn wenn KANZLEI_API_ENABLED=true aber SF-Vars fehlen', async () => {
    stubEnv({ KANZLEI_API_ENABLED: 'true' })
    // SF-Vars nicht gesetzt -> fehlen
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('KANZLEI_SF_API_URL')
    expect(result.detail).toContain('KANZLEI_SF_CLIENT_ID')
    expect(result.detail).toContain('KANZLEI_SF_CLIENT_SECRET')
  })

  it('liefert warn wenn nur KANZLEI_SF_API_URL fehlt (andere vorhanden)', async () => {
    stubEnv({
      KANZLEI_API_ENABLED: 'true',
      KANZLEI_SF_CLIENT_ID: 'cid',
      KANZLEI_SF_CLIENT_SECRET: 'sec',
    })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('warn')
    expect(result.detail).toContain('KANZLEI_SF_API_URL')
    expect(result.metric).toBe(1)
  })

  it('prueft SF-Vars NICHT wenn KANZLEI_API_ENABLED != true', async () => {
    // KANZLEI ist 'false' per BASE_ENV — SF-Vars fehlen, kein warn erwartet
    stubEnv()
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('ok')
  })

  // --- Email-Provider komplett fehlt -> crit ---

  it('liefert crit wenn weder RESEND noch GMAIL gesetzt', async () => {
    stubEnv({ RESEND_API_KEY: undefined, GMAIL_SMTP_USER: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('crit')
    expect(result.detail).toMatch(/RESEND_API_KEY|GMAIL_SMTP_USER/)
    expect(result.metric).toBeGreaterThan(0)
  })

  it('crit bleibt crit auch wenn zusaetzlich VAPID fehlt (Email dominiert)', async () => {
    stubEnv({
      RESEND_API_KEY: undefined,
      GMAIL_SMTP_USER: undefined,
      VAPID_PRIVATE_KEY: undefined,
    })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.status).toBe('crit')
  })

  // --- detail-Inhalte ---

  it('detail bei ok lautet "Alle Pflicht-ENV gesetzt."', async () => {
    stubEnv()
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.detail).toBe('Alle Pflicht-ENV gesetzt.')
  })

  it('detail bei warn beginnt mit "Fehlende Pflicht-ENV:"', async () => {
    stubEnv({ VAPID_PRIVATE_KEY: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.detail).toMatch(/^Fehlende Pflicht-ENV:/)
  })

  it('detail bei crit beginnt mit "Fehlende Pflicht-ENV:"', async () => {
    stubEnv({ RESEND_API_KEY: undefined, GMAIL_SMTP_USER: undefined })
    const result = await configRequiredEnvCheck.run(dummyCtx)
    expect(result.detail).toMatch(/^Fehlende Pflicht-ENV:/)
  })
})
