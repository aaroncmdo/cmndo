/**
 * Text der Onboarding-WhatsApp an einen neuen Kunden (aus finalizeKundeSetup).
 *
 * ⚠ NIE ein Klartext-Passwort. WhatsApp laeuft ueber den Baileys-VPS und wird in `nachrichten`
 * gespeichert — ein Passwort im Klartext waere dort dauerhaft lesbar (DSGVO/Security, Aaron
 * 19.09.2026: "sauber laufen, ich muss das Plugin neu submitten"). Der Zugang laeuft ueber den
 * Magic-Link (One-Tap-Login -> Passwort setzen, `force_password_change`); das Passwort selbst geht
 * ausschliesslich ueber die Welcome-Mail. Faellt die Magic-Link-Generierung aus, bleibt nur die
 * Login-URL — auch dann kein Credential im Klartext.
 *
 * Anrede durchgehend "Sie" (Kundensicht seit #5909; die Vorgaenger-Nachricht mischte Du/Sie).
 *
 * Reine Funktion (kein DB/Netz) — nimmt bewusst KEIN Passwort entgegen: ein Leak ist strukturell
 * unmoeglich, nicht nur "gerade nicht getan".
 */
export function buildKundeZugangWhatsAppText(opts: { magicLink: string | null; loginUrl: string }): string {
  if (opts.magicLink) {
    return [
      '🔐 Ihr Claimondo-Zugang',
      '',
      'Mit diesem Link kommen Sie direkt in Ihr Portal — dort legen Sie Ihr Passwort fest:',
      opts.magicLink,
      '',
      'Ihre Zugangsdaten haben wir Ihnen zusätzlich per E-Mail geschickt.',
      '',
      'Ihr Claimondo-Team',
    ].join('\n')
  }
  return [
    '🔐 Ihr Claimondo-Zugang',
    '',
    'Ihr Konto ist eingerichtet. Melden Sie sich hier an:',
    opts.loginUrl,
    '',
    'Ihre Zugangsdaten haben wir Ihnen per E-Mail geschickt.',
    '',
    'Ihr Claimondo-Team',
  ].join('\n')
}
