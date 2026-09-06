// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// SV-Basic-Claim: Passwort-Setzen-Link fuer selbst-beanspruchende SVs.
// Wird nach erfolgreichem beanspracheSvLead-Flow an die beanspruchte Email-Adresse
// versendet. Kein Branding (kein SV-Context im Claim-Moment), Claimondo-Standard.

import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.claimondo.de'

type Props = {
  vorname: string | null
  actionUrl: string
}

export function subject(_p: Props): string {
  return 'Ihr Claimondo-Konto – Passwort festlegen'
}

export function SvBasicClaimLinkEmail({ vorname, actionUrl }: Props) {
  const anrede = vorname ? `Hallo ${vorname},` : 'Hallo,'
  return (
    <EmailShell preview="Legen Sie jetzt Ihr Passwort fest und aktivieren Sie Ihr Konto.">
      <Hero
        logoUrl={null}
        headline={anrede}
      />
      <Card>
        <Paragraph>
          Ihr Eintrag auf Claimondo wurde erfolgreich beansprucht. Lege jetzt
          Ihr Passwort fest, um Sie in Ihr Konto einzuloggen und den
          Verifizierungsprozess abzuschließen.
        </Paragraph>
        <Paragraph>
          Der Link ist 24 Stunden gültig.
        </Paragraph>
        <Button href={actionUrl}>Passwort festlegen</Button>
        <Paragraph>
          Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
          <a href={actionUrl} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
            {actionUrl}
          </a>
        </Paragraph>
        <Paragraph>
          Nach der Passwort-Vergabe prüfen wir Ihre Angaben innerhalb von 48 Stunden.
          Sie erhalten eine Benachrichtigung, sobald Ihr Konto freigeschaltet ist.
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
