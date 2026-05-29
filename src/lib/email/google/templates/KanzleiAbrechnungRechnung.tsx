// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, PositionsTable, Footer } from '../../components'
import { APP_URL } from './layout'

type Position = { bezeichnung: string; betrag: string }

type Props = {
  fallNummer: string
  rechnungsNr: string
  rechnungsDatum: string
  positionen: Position[]
  gesamtbetrag: string
  fallId: string
}

export function subject(p: Props) {
  return `Abrechnung + Rechnung für Fall ${p.fallNummer}`
}

export function KanzleiAbrechnungRechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Kanzlei-Rechnung ${props.rechnungsNr} — ${props.gesamtbetrag}`}>
      <MailHeader />
      <Card>
        <Heading>Abrechnung + Rechnung für Fall {props.fallNummer}</Heading>
        <Paragraph>
          Anbei die Abrechnung und Rechnung für den abgeschlossenen Fall als PDF.
        </Paragraph>

        <InfoRow label="Rechnungs-Nr." value={props.rechnungsNr} />
        <InfoRow label="Datum" value={props.rechnungsDatum} />
        <InfoRow label="Fall" value={props.fallNummer} />

        <PositionsTable positionen={props.positionen} gesamt={props.gesamtbetrag} />

        <Button href={`${APP_URL}/faelle/${props.fallId}`}>Fallakte öffnen</Button>

        <Paragraph>Die Rechnung liegt dieser Email als PDF bei.</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
