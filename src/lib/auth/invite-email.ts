// AAR-auth-haertung (Befund F): Einladungs-Email fuer Staff/Makler.
//
// Vorher stand das Klartext-Initialpasswort im Email-Body — Email ist ein
// geloggter/weitergeleiteter/at-rest gespeicherter Kanal. Jetzt bekommt der
// Eingeladene einen Recovery-Magic-Link (gleiche Mechanik wie die SV-Welcome-
// Mail) und setzt sein eigenes Passwort. Kein Passwort mehr in der Mail.

export type EinladungEmailOpts = {
  vorname: string
  email: string
  /** Rollen-/Kontext-spezifischer Intro-Absatz (bereits HTML). */
  introHtml: string
  /** Recovery-Action-Link (aus generateLink). null -> Fallback auf Passwort-vergessen. */
  magicLink: string | null
  appUrl: string
}

export function einladungEmailHtml(opts: EinladungEmailOpts): string {
  const cta = opts.magicLink
    ? `<p><a href="${opts.magicLink}">Passwort setzen &amp; einloggen</a></p>` +
      `<p style="color:#64748b;font-size:13px">Der Link ist begrenzt gültig. Ist er abgelaufen, ` +
      `nutze „Passwort vergessen" auf der Login-Seite.</p>`
    : `<p>Bitte setze dein Passwort über „Passwort vergessen" auf ` +
      `<a href="${opts.appUrl}/login">${opts.appUrl}/login</a>.</p>`

  return (
    `<p>Hallo ${opts.vorname},</p>` +
    opts.introHtml +
    `<p>E-Mail: <strong>${opts.email}</strong></p>` +
    cta
  )
}
