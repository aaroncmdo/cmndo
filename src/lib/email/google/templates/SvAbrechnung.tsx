// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, Button, PositionsTable, Footer } from '../../components'
import { APP_URL } from './layout'

type Position = { bezeichnung: string; betrag: string }

type Props = {
  svVorname: string
  fallNummer: string
  positionen: Position[]
  gesamtbetrag: string
  zahlungsHinweis: string
  abrechnungId: string
}

export function subject(p: Props) {
  return `Abrechnung für Fall ${p.fallNummer}`
}

export function SvAbrechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Abrechnung ${props.fallNummer} — ${props.gesamtbetrag}`}>
      <MailHeader />
      <Card>
        <Heading>Deine Abrechnung für Fall {props.fallNummer}</Heading>
        <Paragraph>
          Hallo {props.svVorname}, hier ist die Abrechnung für deinen Auftrag:
        </Paragraph>

        <PositionsTable positionen={props.positionen} gesamt={props.gesamtbetrag} />

        <Paragraph>{props.zahlungsHinweis}</Paragraph>

        <Button href={`${APP_URL}/gutachter/abrechnung`}>Zur Abrechnungsübersicht</Button>
      </Card>
      <Footer />
    </EmailShell>
  )
}
