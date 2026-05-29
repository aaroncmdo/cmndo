// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  empfaengerName: string
  abrechnungsNr: string
  monat: string
  anzahlPositionen: number
  summeBrutto: string
  faelligAm: string
}

export function subject(p: Props) {
  return `Abrechnung ${p.abrechnungsNr} — ${p.monat}`
}

export function MarketingAbrechnungEmail(props: Props) {
  return (
    <EmailShell preview={`Abrechnung ${props.abrechnungsNr} — ${props.summeBrutto}`}>
      <MailHeader />
      <Card>
        <Heading>Deine Monatsabrechnung</Heading>
        <Paragraph>
          Hallo {props.empfaengerName}, anbei deine Abrechnung für {props.monat}.
          Der Gesamtbetrag von {props.summeBrutto} ist bis zum {props.faelligAm} zahlbar
          auf das im PDF angegebene Konto.
        </Paragraph>

        <InfoRow label="Abrechnungs-Nr" value={props.abrechnungsNr} />
        <InfoRow label="Zeitraum" value={props.monat} />
        <InfoRow label="Positionen" value={String(props.anzahlPositionen)} />
        <InfoRow label="Gesamtbetrag (brutto)" value={props.summeBrutto} />
        <InfoRow label="Zahlbar bis" value={props.faelligAm} />

        <Paragraph>
          Die detaillierte Abrechnung findest du im angehängten PDF.
        </Paragraph>

        <Button href={`${APP_URL}/admin/finance`}>Zum Finance-Dashboard</Button>
      </Card>
      <Footer />
    </EmailShell>
  )
}
