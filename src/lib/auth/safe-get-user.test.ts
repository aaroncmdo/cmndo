import { describe, it, expect } from 'vitest'
import { safeGetUser } from './safe-get-user'

// CMM-14 Root-Crash-Fix: portal-guard.ts (jedes Top-Level-Portal-Layout) rief
// supabase.auth.getUser() OHNE try/catch. Ein transientes Reject (Netzfehler /
// "context canceled" am Post-Login-Navigations-Uebergang, in Prod-Auth-Logs
// belegt) warf IM Layout -> entkam der rollen-eigenen error.tsx -> lila
// Root-Boundary. Die Middleware (middleware.ts, AAR-622) kapselt denselben Call
// bereits in try/catch. safeGetUser zieht diese Sicherung in eine pure,
// dependency-injizierte Funktion (testbar ohne Next/Supabase-Mock).

describe('safeGetUser', () => {
  it('gibt den User zurueck, wenn getUser aufloest', async () => {
    const user = { id: 'u1' }
    expect(await safeGetUser(() => Promise.resolve({ data: { user } }))).toBe(user)
  })

  it('gibt null zurueck, wenn getUser mit user=null aufloest (Auth-Fehler ohne Throw)', async () => {
    expect(await safeGetUser(() => Promise.resolve({ data: { user: null } }))).toBeNull()
  })

  it('gibt null zurueck, wenn die getUser-Antwort keine data traegt', async () => {
    expect(await safeGetUser(() => Promise.resolve(null))).toBeNull()
  })

  it('gibt null zurueck STATT zu werfen, wenn getUser rejectet ("context canceled"/Netzfehler)', async () => {
    // Kern des Fixes: ein Reject darf NICHT mehr durchschlagen (sonst Layout-Throw
    // -> lila Root-Crash). Ohne den try/catch in safeGetUser wuerde dieser Test
    // mit einer unhandled rejection scheitern.
    expect(await safeGetUser(() => Promise.reject(new Error('context canceled')))).toBeNull()
  })
})
