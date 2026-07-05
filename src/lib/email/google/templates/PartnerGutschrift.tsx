// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  empfaengerName: string
  gutschriftNr: string
  betrag: string
  datum: string
}

export function subject(p: Props) {
  return `Ihre Gutschrift ${p.gutschriftNr}`
}

export function PartnerGutschriftEmail(props: Props) {
  return (
    <EmailShell preview={`Gutschrift ${props.gutschriftNr} — ${props.betrag}`}>
      <MailHeader />
      <Card>
        <Heading>Ihre Gutschrift</Heading>
        <Paragraph>
          Hallo {props.empfaengerName}, anbei Ihre Gutschrift {props.gutschriftNr} über {props.betrag}.
          Die Auszahlung erfolgt auf das bei uns hinterlegte Konto.
        </Paragraph>

        <InfoRow label="Gutschrift-Nr" value={props.gutschriftNr} />
        <InfoRow label="Betrag" value={props.betrag} />
        <InfoRow label="Datum" value={props.datum} />

        <Paragraph>
          Die Gutschrift finden Sie im angehängten PDF.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
