// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  svVorname: string
  fallNummer: string
  rechnungsNr: string
  rechnungsDatum: string
  betrag: string
  rechnungId: string
}

export function subject(p: Props) {
  return `Rechnung ${p.rechnungsNr} für Fall ${p.fallNummer}`
}

export function SvRechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Rechnung ${props.rechnungsNr} — ${props.betrag}`}>
      <MailHeader />
      <Card>
        <Heading>Ihre Rechnung</Heading>
        <Paragraph>
          Hallo {props.svVorname}, anbei Ihre Rechnung für Fall {props.fallNummer} als PDF.
        </Paragraph>

        <InfoRow label="Rechnungs-Nr." value={props.rechnungsNr} />
        <InfoRow label="Datum" value={props.rechnungsDatum} />
        <InfoRow label="Betrag" value={props.betrag} />
        <InfoRow label="Fall" value={props.fallNummer} />

        <Paragraph>
          Die Rechnung finden Sie auch jederzeit im Portal:
        </Paragraph>
        <Button href={`${APP_URL}/gutachter/abrechnung`}>Im Portal ansehen</Button>
      </Card>
      <Footer />
    </EmailShell>
  )
}
