// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, Footer } from '../../components'

// Reklamation: Frist automatisch abgelaufen — Benachrichtigung an SV

type Props = {
  vorname: string | null
}

export function subject(_p: Props) {
  return 'Reklamation abgelehnt — Frist überschritten'
}

export function ReklamationFristAbgelaufenEmail(props: Props) {
  return (
    <EmailShell preview="Ihre Reklamation wurde automatisch abgelehnt">
      <MailHeader />
      <Card>
        <Heading>Reklamation abgelehnt</Heading>

        <Paragraph>
          Hallo {props.vorname ?? 'Partner'},
        </Paragraph>
        <Paragraph>
          Ihre Reklamation wurde automatisch abgelehnt, da die 5-Werktage-Frist
          überschritten wurde.
        </Paragraph>

        <Paragraph>
          Bei Fragen wenden Sie sich bitte an <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>

        <Paragraph>Ihr Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
