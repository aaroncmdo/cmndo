// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL } from './layout'
import { FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'

// Makler-Aktivierungs-Onboarding: Welcome-Mail an einen selbst-registrierten Makler.
// Formelles "Sie" (B2B, wie das Reg-Portal). Kundennutzen-Framing, kein Provisions-Claim.

type Props = {
  firma: string
  vorname: string
  landeseiteUrl: string
  // Recovery-Magic-Link zum Passwort-Setzen (best-effort, kann null sein).
  magicLink?: string | null
}

export function subject(p: Props) {
  return `Willkommen als Claimondo-Partner, ${p.firma}!`
}

export function MaklerWelcomeEmail(props: Props) {
  const loginUrl = `${APP_URL}/login`

  return (
    <EmailShell preview={`Willkommen als Claimondo-Partner, ${props.firma}!`}>
      <MailHeader />
      <Card>
        <Heading>Hallo {props.vorname}!</Heading>
        <Paragraph>
          Ihr Makler-Konto für <strong>{props.firma}</strong> ist aktiv — schön, dass Sie dabei
          sind! Als Claimondo-Partner bieten Sie Ihren Kunden nach einem Kfz-Schaden einen echten
          Mehrwert: einen unabhängigen Gutachter und die kostenlose Schadenregulierung nach
          §249 BGB, ganz ohne Aufwand für Sie.
        </Paragraph>

        <Heading>Ihre persönliche Empfehlungs-Landeseite</Heading>
        <Paragraph>
          Jeder Kunde, der über diesen Link kommt, ist automatisch Ihnen zugeordnet:
        </Paragraph>
        <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(3)} 0` }}>
          <InfoRow label="Ihre Landeseite" value={props.landeseiteUrl} />
        </div>

        <Heading>Nächste Schritte</Heading>
        <Paragraph>
          <strong>1.</strong> Setzen Sie über den Button unten Ihr Passwort und melden Sie sich an
          (mit der E-Mail-Adresse, an die diese Mail ging).
        </Paragraph>
        <Paragraph>
          <strong>2.</strong> Im Portal führen wir Sie durch die ersten Schritte: Link teilen,
          QR-Code fürs Büro und die Einbindung für Ihre Website.
        </Paragraph>
        <Paragraph>
          <strong>3.</strong> Der schnellste Start: Schicken Sie Ihren Link direkt an einen Kunden,
          der gerade einen Schaden hat.
        </Paragraph>

        {props.magicLink ? (
          <Note>Der Link zum Passwort-Setzen ist aus Sicherheitsgründen zeitlich begrenzt gültig. Ist er abgelaufen, nutzen Sie „Passwort vergessen" auf der Login-Seite.</Note>
        ) : (
          <Note>Klicken Sie auf der Login-Seite auf „Passwort vergessen", um Ihr Passwort zu setzen.</Note>
        )}

        <Button href={props.magicLink ?? loginUrl}>
          {props.magicLink ? 'Passwort setzen & einloggen' : 'Jetzt einloggen'}
        </Button>

        <Paragraph>
          Bei Fragen erreichen Sie uns unter <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>
        <Paragraph>
          Viele Grüße,<br />
          {FOUNDER_AARON_NAME}<br />
          Claimondo GmbH i.G.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
