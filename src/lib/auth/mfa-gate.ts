// AAR-939: Reine Entscheidungslogik des 2FA-Gates (Supabase-MFA / AAL).
//
// PURE-Modul (kein 'use server'/'server-only') -> importierbar in Middleware,
// Server-Component, Server-Action UND Unit-Test. Trifft KEINE Auth-Calls; die
// Inputs (AAL aus dem JWT, Faktor-Existenz, Cookies) sammelt der Caller.
//
// Warum AAL statt Cookie: Die alte 2FA-Schranke haengte an einem separaten
// `claimondo_2fa_verified`-Cookie, das unabhaengig von der Session ablief ->
// Reload-Loop. Die AAL (Authenticator Assurance Level) steckt im Supabase-JWT
// und wird mit der Session refresht, daher ist diese Loop-Klasse strukturell
// ausgeschlossen.

/** Strukturelle Form eines Supabase-MFA-Faktors (kein SDK-Import noetig). */
export type FaktorLike = { status: string; factor_type?: string }

/**
 * Hat der User mindestens einen verifizierten MFA-Faktor? Quelle ist
 * `user.factors` aus `supabase.auth.getUser()`. Ein verifizierter Faktor (egal
 * welcher Typ) entspricht Supabase' nextLevel='aal2' — die Session muss dann
 * auf aal2 gehoben werden, um durchgelassen zu werden.
 */
export function hatVerifiziertenFaktor(
  factors: readonly FaktorLike[] | null | undefined,
): boolean {
  return (factors ?? []).some((f) => f.status === 'verified')
}

/** Faktor-Eintrag mit ID — für die Login-Zweitfaktor-Wahl. */
export type FaktorEintrag = { id: string; status: string; factor_type?: string }

export type FaktorWahl = {
  /** Bevorzugter Faktor für die Login-Challenge (TOTP vor Phone), null = keiner */
  preferred: 'totp' | 'phone' | null
  totpId: string | null
  phoneId: string | null
  /** preferred=totp UND ein Phone-Faktor existiert → „Stattdessen SMS"-Fallback anbieten */
  hasSmsFallback: boolean
}

/**
 * AAR-939 TOTP: Wählt den Login-Zweitfaktor aus den verifizierten Faktoren.
 * TOTP wird bevorzugt (offline, kein SMS-Delay/-Cost); ein zusätzlicher
 * Phone-Faktor ist dann der SMS-Fallback. Pure Logik — der Caller (login/2fa
 * page) sammelt user.factors.
 */
export function waehleZweitFaktor(
  factors: readonly FaktorEintrag[] | null | undefined,
): FaktorWahl {
  const verified = (factors ?? []).filter((f) => f.status === 'verified')
  const totp = verified.find((f) => f.factor_type === 'totp') ?? null
  const phone = verified.find((f) => f.factor_type === 'phone') ?? null
  const preferred: 'totp' | 'phone' | null = totp ? 'totp' : phone ? 'phone' : null
  return {
    preferred,
    totpId: totp?.id ?? null,
    phoneId: phone?.id ?? null,
    hasSmsFallback: preferred === 'totp' && phone !== null,
  }
}

export type MfaGateInput = {
  /** request.nextUrl.pathname === '/login/2fa' — nie auf sich selbst redirecten */
  isOn2faPage: boolean
  /** user.app_metadata.provider === 'google' — Google-Login hat kein Custom-2FA */
  isGoogleUser: boolean
  /** aktuelles Assurance-Level der Session (aus dem Access-Token), null = unbekannt */
  aalCurrent: 'aal1' | 'aal2' | null
  /** User hat mindestens einen verifizierten MFA-Faktor (Phone) */
  hasVerifiedFactor: boolean
  /** gueltiger Remember-Token (Trusted-Device) liegt vor */
  hasRememberToken: boolean
}

export type MfaGateDecision = 'allow' | 'challenge'

/**
 * Entscheidet, ob ein eingeloggter Request durchgelassen wird ('allow') oder
 * den zweiten Faktor nachholen muss ('challenge' -> Redirect auf /login/2fa).
 *
 * Reihenfolge ist bedeutsam: Bypass-Bedingungen (Self-Page, Google) haben
 * Vorrang vor der eigentlichen Faktor-/AAL-Pruefung. F2 (AAR-audit-2fa): die
 * fruehere /gutachter-Ausnahme ist entfernt — Enforcement folgt dem Faktor.
 */
export function entscheideMfaGate(input: MfaGateInput): MfaGateDecision {
  // Die /login/2fa-Seite selbst darf nie auf sich selbst zeigen, sonst Loop.
  if (input.isOn2faPage) return 'allow'

  // Google-Login: kein Custom-2FA-Schritt.
  if (input.isGoogleUser) return 'allow'

  // Soft-Enroll: Wer keinen verifizierten Faktor hat, ist nicht gegated.
  if (!input.hasVerifiedFactor) return 'allow'

  // MFA wurde in dieser Session bereits erfuellt.
  if (input.aalCurrent === 'aal2') return 'allow'

  // Trusted-Device: gueltiger Remember-Token ueberspringt die Challenge.
  if (input.hasRememberToken) return 'allow'

  // Verifizierter Faktor, aber Session erst auf aal1 (oder unbekannt) und kein
  // Trusted-Device -> zweiter Faktor faellig.
  return 'challenge'
}

export type LoginRoutingInput = {
  /** user.app_metadata.provider === 'google' */
  isGoogleUser: boolean
  /** User hat einen verifizierten Supabase-MFA-Faktor */
  hasVerifiedFactor: boolean
  /** Legacy-Flag: profile.twofa_aktiviert || profile.twofa_email_aktiviert */
  legacy2faWanted: boolean
  /** F3: interne Rolle mit 2FA-Pflicht (admin/dispatch/kanzlei/kundenbetreuer) */
  rollePflicht: boolean
}

export type LoginRouting = 'portal' | 'challenge' | 'enroll'

/**
 * Entscheidet direkt nach erfolgreichem Passwort-Login, wohin der User geht.
 * Der Caller (login/actions.ts) hat hier — anders als die Middleware — Zugriff
 * auf die profiles-Flags und kann so den Soft-Enroll-Fall erkennen.
 *
 *   'portal'    -> Rollen-Portal (kein zweiter Faktor noetig)
 *   'challenge' -> /login/2fa, vorhandenen Faktor verifizieren
 *   'enroll'    -> /login/2fa im Enroll-Modus (Legacy-User holt den Faktor nach)
 */
export function entscheideLoginRouting(input: LoginRoutingInput): LoginRouting {
  // Google-Login: kein Custom-2FA-Schritt (Bypass-Paritaet zum Gate).
  if (input.isGoogleUser) return 'portal'

  // Bereits enrollt -> Faktor verifizieren.
  if (input.hasVerifiedFactor) return 'challenge'

  // F3: interne Pflicht-Rolle ohne Faktor -> Enroll (ueberstimmt legacy/portal).
  if (input.rollePflicht) return 'enroll'

  // Legacy-2FA gewollt, aber noch kein Supabase-Faktor -> Soft-Enroll.
  if (input.legacy2faWanted) return 'enroll'

  // Kein 2FA -> direkt ins Portal.
  return 'portal'
}

// F3 (AAR-audit-2fa, Aaron 2026-07-06 „interne Rollen Pflicht"): Rollen die
// 2FA verpflichtend brauchen. Enforcement laeuft ueber die profiles.rolle-Leser
// (login/actions, /login/2fa page, requirePortalAccess) — NICHT die Middleware,
// weil app_metadata.rolle unzuverlaessig ist (Admins 0/5 gesetzt).
const ZWEI_FAKTOR_PFLICHT_ROLLEN = new Set(['admin', 'dispatch', 'kanzlei', 'kundenbetreuer'])

/** true, wenn die Rolle 2FA verpflichtend braucht (interne Rollen). */
export function istZweiFaktorPflicht(rolle: string | null | undefined): boolean {
  return !!rolle && ZWEI_FAKTOR_PFLICHT_ROLLEN.has(rolle)
}
