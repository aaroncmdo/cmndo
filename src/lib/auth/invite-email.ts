// AAR-auth-haertung (Befund F): Einladungs-Email fuer Staff/Makler.
//
// Vorher stand das Klartext-Initialpasswort im Email-Body — Email ist ein
// geloggter/weitergeleiteter/at-rest gespeicherter Kanal. Jetzt bekommt der
// Eingeladene einen Recovery-Magic-Link (gleiche Mechanik wie die SV-Welcome-
// Mail) und setzt sein eigenes Passwort. Standard: KEIN Passwort in der Mail.
//
// Ausnahme (Aaron-Entscheid 13.07.): fuer die admin-getriggerte interne
// Mitarbeiter-Anlage kann das Initial-Passwort ZUSAETZLICH zum Magic-Link
// mitgeschickt werden (opts.einmalpasswort) — Onboarding-Komfort fuer
// @claimondo.de-Staff. Nur wenn der Param gesetzt ist; alle anderen Caller
// lassen ihn weg und bleiben passwortlos.

export type EinladungEmailOpts = {
  vorname: string
  email: string
  /** Rollen-/Kontext-spezifischer Intro-Absatz (bereits HTML). */
  introHtml: string
  /** Recovery-Action-Link (aus generateLink). null -> Fallback auf Passwort-vergessen. */
  magicLink: string | null
  appUrl: string
  /**
   * Optionales Initial-Passwort. Wird NUR gerendert wenn gesetzt (dokumentierte
   * Ausnahme von Befund F, s.o.). Weglassen = weiterhin kein Passwort in der Mail.
   */
  einmalpasswort?: string
}

export function einladungEmailHtml(opts: EinladungEmailOpts): string {
  const cta = opts.magicLink
    ? `<p><a href="${opts.magicLink}">Passwort setzen &amp; einloggen</a></p>` +
      `<p style="color:#64748b;font-size:13px">Der Link ist begrenzt gültig. Ist er abgelaufen, ` +
      `nutze „Passwort vergessen" auf der Login-Seite.</p>`
    : `<p>Bitte setze Ihr Passwort über „Passwort vergessen" auf ` +
      `<a href="${opts.appUrl}/login">${opts.appUrl}/login</a>.</p>`

  // Optionales Initial-Passwort (nur wenn gesetzt) — zusaetzlich zum Magic-Link.
  const passwortBlock = opts.einmalpasswort
    ? `<p>Initial-Passwort: <strong>${opts.einmalpasswort}</strong> ` +
      `<span style="color:#64748b;font-size:13px">(bitte nach dem ersten Login ändern)</span></p>`
    : ''

  return (
    `<p>Hallo ${opts.vorname},</p>` +
    opts.introHtml +
    `<p>E-Mail: <strong>${opts.email}</strong></p>` +
    passwortBlock +
    cta
  )
}
