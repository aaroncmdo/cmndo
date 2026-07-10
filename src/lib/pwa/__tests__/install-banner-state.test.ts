import { describe, it, expect } from 'vitest'
import {
  canOfferInstall,
  markShown,
  markDismissed,
  markInstalled,
  type BannerEnv,
} from '../install-banner-state'

// Repo nutzt vitest environment: 'node' (kein jsdom/testing-library). Die
// Banner-Regeln leben deshalb in einem reinen, React-/DOM-freien Policy-Modul
// und werden hier mit In-Memory-Storages getestet — deckt genau die drei
// Anforderungen ab: (1) einmal pro Session, (2) nie wenn installiert,
// (3) nach Dismiss dauerhaft weg.

function fakeStorage() {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => {
      m.set(k, v)
    },
  }
}

function makeEnv(over: { isStandalone?: boolean } = {}): BannerEnv {
  return {
    local: fakeStorage(),
    session: fakeStorage(),
    isStandalone: over.isStandalone ?? false,
  }
}

describe('pwa install-banner-state', () => {
  it('bietet den Banner in einer frischen Session an', () => {
    expect(canOfferInstall(makeEnv())).toBe(true)
  })

  it('bietet NICHT an, wenn die App bereits als PWA laeuft (standalone)', () => {
    expect(canOfferInstall(makeEnv({ isStandalone: true }))).toBe(false)
  })

  it('bietet NICHT an, wenn bereits installiert (appinstalled-Flag persistiert)', () => {
    const env = makeEnv()
    markInstalled(env)
    expect(canOfferInstall(env)).toBe(false)
  })

  it('zeigt pro Session nur EINMAL — nach markShown kein Re-Pop', () => {
    const env = makeEnv()
    expect(canOfferInstall(env)).toBe(true) // erstes Event -> darf zeigen
    markShown(env)
    expect(canOfferInstall(env)).toBe(false) // erneutes beforeinstallprompt -> kein Re-Pop
  })

  it('bleibt nach Dismiss dauerhaft weg — auch in einer neuen Session', () => {
    const env = makeEnv()
    markDismissed(env)
    expect(canOfferInstall(env)).toBe(false)
    // Neue Session = frische sessionStorage, aber der localStorage-Dismiss bleibt.
    const nextSession: BannerEnv = { ...env, session: fakeStorage() }
    expect(canOfferInstall(nextSession)).toBe(false)
  })

  it('markShown gilt nur fuer die Session — eine neue Session darf erneut anbieten', () => {
    const env = makeEnv()
    markShown(env)
    expect(canOfferInstall(env)).toBe(false)
    const nextSession: BannerEnv = { ...env, session: fakeStorage() }
    expect(canOfferInstall(nextSession)).toBe(true)
  })

  it('markInstalled ueberlebt neue Sessions (nie wieder anbieten)', () => {
    const env = makeEnv()
    markInstalled(env)
    const nextSession: BannerEnv = { ...env, session: fakeStorage() }
    expect(canOfferInstall(nextSession)).toBe(false)
  })
})
