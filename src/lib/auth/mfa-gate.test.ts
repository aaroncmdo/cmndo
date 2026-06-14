import { describe, it, expect } from 'vitest'
import {
  entscheideMfaGate,
  entscheideLoginRouting,
  hatVerifiziertenFaktor,
  type MfaGateInput,
  type LoginRoutingInput,
} from './mfa-gate'

// AAR-939: Reine Entscheidungslogik des 2FA-Gates auf Basis von Supabase-MFA/AAL.
// 'challenge' => Middleware leitet auf /login/2fa (zweiter Faktor faellig).
// 'allow'     => Request durchlassen.
//
// Kern-Eigenschaft: Die Entscheidung haengt NUR an der Session-AAL + Faktor-
// Existenz (im JWT), nicht an einem separat ablaufenden Cookie -> die alte
// Reload-Loop-Klasse ist strukturell ausgeschlossen.

function input(overrides: Partial<MfaGateInput> = {}): MfaGateInput {
  // Default = der Fall der eine Challenge erfordert: verifizierter Phone-Faktor,
  // frische Session (aal1), kein Trusted-Device, kein Bypass-Pfad.
  return {
    isOn2faPage: false,
    isGoogleUser: false,
    isGutachterPath: false,
    aalCurrent: 'aal1',
    hasVerifiedFactor: true,
    hasRememberToken: false,
    ...overrides,
  }
}

describe('entscheideMfaGate', () => {
  it('fordert Challenge: verifizierter Faktor, aal1, kein Trusted-Device', () => {
    expect(entscheideMfaGate(input())).toBe('challenge')
  })

  it('laesst durch wenn MFA in dieser Session schon erfuellt ist (aal2)', () => {
    expect(entscheideMfaGate(input({ aalCurrent: 'aal2' }))).toBe('allow')
  })

  it('laesst durch ohne verifizierten Faktor (Soft-Enroll: nicht gegated)', () => {
    expect(entscheideMfaGate(input({ hasVerifiedFactor: false }))).toBe('allow')
  })

  it('laesst durch auf Trusted-Device (gueltiger Remember-Token)', () => {
    expect(entscheideMfaGate(input({ hasRememberToken: true }))).toBe('allow')
  })

  it('laesst Google-User durch (kein Custom-2FA)', () => {
    expect(entscheideMfaGate(input({ isGoogleUser: true }))).toBe('allow')
  })

  it('laesst /gutachter-Pfade durch (SV-Portal ist 2FA-frei)', () => {
    expect(entscheideMfaGate(input({ isGutachterPath: true }))).toBe('allow')
  })

  it('laesst die /login/2fa-Seite selbst durch (kein Self-Redirect-Loop)', () => {
    expect(entscheideMfaGate(input({ isOn2faPage: true }))).toBe('allow')
  })

  it('behandelt aalCurrent=null defensiv als nicht-erfuellt -> Challenge', () => {
    expect(entscheideMfaGate(input({ aalCurrent: null }))).toBe('challenge')
  })

  it('Self-Redirect-Schutz hat Vorrang vor einer faelligen Challenge', () => {
    expect(
      entscheideMfaGate(input({ isOn2faPage: true, aalCurrent: 'aal1' })),
    ).toBe('allow')
  })
})

// AAR-939: Routing direkt nach erfolgreichem Passwort-Login. Anders als das
// Middleware-Gate liest der Caller (login/actions.ts) hier die profiles-Flags,
// kann also den Soft-Enroll-Fall (Legacy-2FA-User ohne Supabase-Faktor) von
// "gar kein 2FA" unterscheiden.
//   'portal'    => direkt ins Rollen-Portal (kein zweiter Faktor)
//   'challenge' => /login/2fa, vorhandenen Faktor verifizieren
//   'enroll'    => /login/2fa im Enroll-Modus (Legacy-User holt Supabase-Faktor nach)

function loginInput(overrides: Partial<LoginRoutingInput> = {}): LoginRoutingInput {
  return {
    isGoogleUser: false,
    hasVerifiedFactor: false,
    legacy2faWanted: false,
    ...overrides,
  }
}

describe('entscheideLoginRouting', () => {
  it('Portal ohne 2FA: kein Faktor, keine Legacy-Flag', () => {
    expect(entscheideLoginRouting(loginInput())).toBe('portal')
  })

  it('Challenge: User hat einen verifizierten Supabase-Faktor', () => {
    expect(entscheideLoginRouting(loginInput({ hasVerifiedFactor: true }))).toBe('challenge')
  })

  it('Enroll: Legacy-2FA gewollt, aber noch kein Supabase-Faktor (Soft-Enroll)', () => {
    expect(entscheideLoginRouting(loginInput({ legacy2faWanted: true }))).toBe('enroll')
  })

  it('Google-User: immer Portal (kein Custom-2FA)', () => {
    expect(entscheideLoginRouting(loginInput({ isGoogleUser: true }))).toBe('portal')
  })

  it('Faktor schlaegt Legacy-Flag: bereits enrollt -> Challenge, nicht Enroll', () => {
    expect(
      entscheideLoginRouting(loginInput({ hasVerifiedFactor: true, legacy2faWanted: true })),
    ).toBe('challenge')
  })

  it('Google schlaegt Faktor: bleibt Portal (2FA-Bypass-Paritaet)', () => {
    expect(
      entscheideLoginRouting(loginInput({ isGoogleUser: true, hasVerifiedFactor: true })),
    ).toBe('portal')
  })
})

// AAR-939: Faktor-Praedikat. Quelle ist user.factors aus getUser() — bewusst
// strukturell typisiert (kein SDK-Import), damit das Gate-Modul pure bleibt.
describe('hatVerifiziertenFaktor', () => {
  it('true bei mindestens einem verifizierten Faktor', () => {
    expect(hatVerifiziertenFaktor([{ status: 'verified', factor_type: 'phone' }])).toBe(true)
  })

  it('false wenn alle Faktoren unverifiziert (Enroll abgebrochen)', () => {
    expect(hatVerifiziertenFaktor([{ status: 'unverified', factor_type: 'phone' }])).toBe(false)
  })

  it('false bei leerer Liste, null und undefined', () => {
    expect(hatVerifiziertenFaktor([])).toBe(false)
    expect(hatVerifiziertenFaktor(null)).toBe(false)
    expect(hatVerifiziertenFaktor(undefined)).toBe(false)
  })

  it('true sobald EIN Faktor verifiziert ist, auch neben unverifizierten', () => {
    expect(
      hatVerifiziertenFaktor([
        { status: 'unverified', factor_type: 'phone' },
        { status: 'verified', factor_type: 'phone' },
      ]),
    ).toBe(true)
  })
})
