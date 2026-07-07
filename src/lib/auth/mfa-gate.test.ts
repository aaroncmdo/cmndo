import { describe, it, expect } from 'vitest'
import {
  entscheideMfaGate,
  entscheideLoginRouting,
  hatVerifiziertenFaktor,
  waehleZweitFaktor,
  istZweiFaktorPflicht,
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

  it('challenge auch auf /gutachter (Exemption entfernt): Faktor + aal1', () => {
    // F2: SV-Portal ist nicht mehr 2FA-frei. Ein SV mit Faktor wird gechallenged.
    expect(entscheideMfaGate(input())).toBe('challenge')
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

  it('Portal: kein Supabase-Faktor -> optional, kein erzwungener Enroll', () => {
    expect(entscheideLoginRouting(loginInput())).toBe('portal')
  })

  it('Google-User: immer Portal (kein Custom-2FA)', () => {
    expect(entscheideLoginRouting(loginInput({ isGoogleUser: true }))).toBe('portal')
  })

  it('Faktor -> Challenge (bereits enrollt)', () => {
    expect(
      entscheideLoginRouting(loginInput({ hasVerifiedFactor: true })),
    ).toBe('challenge')
  })

  it('Google schlaegt Faktor: bleibt Portal (2FA-Bypass-Paritaet)', () => {
    expect(
      entscheideLoginRouting(loginInput({ isGoogleUser: true, hasVerifiedFactor: true })),
    ).toBe('portal')
  })
})

// F3 (AAR-audit-2fa): 2FA-Pflicht fuer interne Rollen.
describe('istZweiFaktorPflicht', () => {
  it('true fuer interne Rollen', () => {
    for (const r of ['admin', 'dispatch', 'kanzlei', 'kundenbetreuer']) {
      expect(istZweiFaktorPflicht(r)).toBe(true)
    }
  })
  it('false fuer externe Rollen + null/undefined', () => {
    for (const r of ['kunde', 'sachverstaendiger', 'makler', 'werkstatt']) {
      expect(istZweiFaktorPflicht(r)).toBe(false)
    }
    expect(istZweiFaktorPflicht(null)).toBe(false)
    expect(istZweiFaktorPflicht(undefined)).toBe(false)
  })
})

describe('entscheideLoginRouting — 2FA optional (kein Lockout)', () => {
  it('interne Rolle ohne Faktor wird NICHT mehr in Enroll gezwungen -> portal', () => {
    // rollePflicht existiert nicht mehr als Input; die Entscheidung haengt nur
    // am Faktor. Ein Admin ohne Faktor landet im Portal (Lockout-Regression).
    expect(entscheideLoginRouting({ isGoogleUser: false, hasVerifiedFactor: false })).toBe('portal')
  })
  it('mit Faktor weiterhin challenge', () => {
    expect(entscheideLoginRouting({ isGoogleUser: false, hasVerifiedFactor: true })).toBe('challenge')
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

// AAR-939 TOTP: Wahl des Login-Zweitfaktors. TOTP wird bevorzugt (offline, kein
// SMS-Delay/-Cost); ein zusätzlicher Phone-Faktor ist dann der SMS-Fallback.
describe('waehleZweitFaktor', () => {
  it('nur Phone → preferred=phone, kein SMS-Fallback', () => {
    expect(waehleZweitFaktor([{ id: 'p1', status: 'verified', factor_type: 'phone' }])).toEqual({
      preferred: 'phone', totpId: null, phoneId: 'p1', hasSmsFallback: false,
    })
  })

  it('nur TOTP → preferred=totp, kein Fallback', () => {
    expect(waehleZweitFaktor([{ id: 't1', status: 'verified', factor_type: 'totp' }])).toEqual({
      preferred: 'totp', totpId: 't1', phoneId: null, hasSmsFallback: false,
    })
  })

  it('beide → TOTP bevorzugt + SMS-Fallback', () => {
    expect(waehleZweitFaktor([
      { id: 'p1', status: 'verified', factor_type: 'phone' },
      { id: 't1', status: 'verified', factor_type: 'totp' },
    ])).toEqual({ preferred: 'totp', totpId: 't1', phoneId: 'p1', hasSmsFallback: true })
  })

  it('ignoriert unverifizierte Faktoren', () => {
    expect(waehleZweitFaktor([
      { id: 't-un', status: 'unverified', factor_type: 'totp' },
      { id: 'p1', status: 'verified', factor_type: 'phone' },
    ])).toEqual({ preferred: 'phone', totpId: null, phoneId: 'p1', hasSmsFallback: false })
  })

  it('keine verifizierten / leer / null → preferred=null', () => {
    const leer = { preferred: null, totpId: null, phoneId: null, hasSmsFallback: false }
    expect(waehleZweitFaktor([{ id: 'x', status: 'unverified', factor_type: 'totp' }])).toEqual(leer)
    expect(waehleZweitFaktor([])).toEqual(leer)
    expect(waehleZweitFaktor(null)).toEqual(leer)
    expect(waehleZweitFaktor(undefined)).toEqual(leer)
  })
})
