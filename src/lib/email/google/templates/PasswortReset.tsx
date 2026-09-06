// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Passwort-vergessen: branded Claimondo-Reset-Mail mit Recovery-Link.
//
// Loest den Supabase-Built-in-Mailer (noreply@mail.app.supabase.io) ab: der hatte ein
// generisches Template, ein projektweites Rate-Limit (~2-4 Mails/h) und schlechte
// Zustellbarkeit bei Firmen-Domains. Diese Mail geht ueber die App-eigene Resend-/SMTP-
// Pipeline (sendEmail) — gleiche Zustellbarkeit + Optik wie alle anderen Claimondo-Mails.
//
// KEIN Whitelabel-Branding: Auth-Mails bleiben Claimondo (AGENTS.md §branding-rules,
// analog TwoFactorCode / SvBasicClaimLink).

import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

type Props = {
  vorname: string | null
  actionUrl: string
}

export function subject(_p: Props): string {
  return 'Passwort zurücksetzen – Claimondo'
}

export function PasswortResetEmail({ vorname, actionUrl }: Props) {
  const anrede = vorname ? `Hallo ${vorname},` : 'Hallo,'
  return (
    <EmailShell preview="Setze jetzt ein neues Passwort für Ihr Claimondo-Konto.">
      <Hero logoUrl={null} headline={anrede} />
      <Card>
        <Paragraph>
          Sie haben ein neues Passwort für Ihr Claimondo-Konto angefordert. Klicken Sie auf den
          Button, um ein neues Passwort zu vergeben.
        </Paragraph>
        <Button href={actionUrl}>Neues Passwort festlegen</Button>
        <Paragraph>
          Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
          <a href={actionUrl} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
            {actionUrl}
          </a>
        </Paragraph>
        <Paragraph>
          Der Link ist aus Sicherheitsgründen nur begrenzt gültig und kann nur einmal verwendet
          werden. Falls er nicht mehr funktioniert, fordere einfach einen neuen an.
        </Paragraph>
        <Paragraph>
          Sie haben kein neues Passwort angefordert? Dann können Sie diese E-Mail einfach
          ignorieren — Ihr Passwort bleibt unverändert.
        </Paragraph>
        <Paragraph>
          Bei Fragen erreichen Sie uns unter{' '}
          <a href={APP_URL} style={{ color: email.color.ondo }}>
            {APP_URL}
          </a>
          .
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
