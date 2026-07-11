// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Flottenmanager Willkommens-Mail. Claimondo-Standard (interner Partner,
// kein Whitelabel). Magic-Link-Weg: Button "Passwort setzen & einloggen"
// fuehrt auf /passwort-zuruecksetzen -> Cookie-Login ins Flottenmanager-Portal.

import { EmailShell, MailHeader, Card, Heading, Paragraph, Button, Note, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  vorname: string
  firmaName: string
  // Recovery-Magic-Link zum Passwort-Setzen (best-effort, kann null sein).
  magicLink?: string | null
}

export function subject(p: Props): string {
  return `Willkommen als Flottenmanager – ${p.firmaName}`
}

export function FlottenmanagerWelcomeEmail(props: Props) {
  const loginUrl = `${APP_URL}/login`

  return (
    <EmailShell preview={`Willkommen als Flottenmanager bei Claimondo, ${props.vorname}!`}>
      <MailHeader />
      <Card>
        <Heading>Hallo {props.vorname}!</Heading>
        <Paragraph>
          Ihr Flottenmanager-Konto für <strong>{props.firmaName}</strong> ist aktiv. Über das
          Flottenmanager-Portal können Sie Schadensfälle Ihrer Fahrzeugflotte im Überblick
          behalten und bei Bedarf direkt mit uns in Kontakt treten.
        </Paragraph>

        <Heading>Nächste Schritte</Heading>
        <Paragraph>
          <strong>1.</strong> Setzen Sie über den Button unten Ihr Passwort und melden Sie sich an
          (mit der E-Mail-Adresse, an die diese Mail ging).
        </Paragraph>
        <Paragraph>
          <strong>2.</strong> Im Portal sehen Sie alle aktiven Schadensfälle Ihrer Flotte sowie
          den aktuellen Bearbeitungsstatus.
        </Paragraph>

        {props.magicLink ? (
          <Note>
            Der Anmelde-Link ist aus Sicherheitsgründen zeitlich begrenzt gültig. Ist er abgelaufen,
            nutzen Sie „Passwort vergessen" auf der Login-Seite.
          </Note>
        ) : (
          <Note>
            Klicken Sie auf der Login-Seite auf „Passwort vergessen", um Ihr Passwort zu setzen.
          </Note>
        )}

        <Button href={props.magicLink ?? loginUrl}>
          {props.magicLink ? 'Passwort setzen & einloggen' : 'Jetzt einloggen'}
        </Button>

        <Paragraph>
          Bei Fragen erreichen Sie uns unter <strong>hello@claimondo.de</strong>.
        </Paragraph>
        <Paragraph>
          Viele Grüße,<br />
          Ihr Claimondo-Team
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
