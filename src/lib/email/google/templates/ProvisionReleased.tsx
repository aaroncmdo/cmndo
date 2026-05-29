// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'
import { APP_URL } from './layout'

// AAR-493 (M11): Benachrichtigung an Makler, wenn eine Provision nach
// Ablauf der 14-Tage-Hold-Periode auf "freigegeben" gesetzt wurde.

type Props = {
  vorname: string | null
  fallNummer: string | null
  kundeName: string | null
  betrag: number
  serviceTyp: 'komplett' | 'nur_gutachter'
}

const EUR = (n: number) =>
  n.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })

const SERVICE_LABEL: Record<Props['serviceTyp'], string> = {
  komplett: 'Komplett-Betreuung',
  nur_gutachter: 'Nur Gutachter',
}

export function subject(p: Props) {
  return `Provision freigegeben: ${EUR(p.betrag)}`
}

export function ProvisionReleasedEmail(props: Props) {
  const abrechnungUrl = `${APP_URL}/makler/abrechnungen`
  const fallLabel = props.fallNummer ?? '—'
  const kunde = props.kundeName ?? '—'

  return (
    <EmailShell preview={`Ihre Provision in Höhe von ${EUR(props.betrag)} wurde freigegeben.`}>
      <MailHeader />
      <Card>
        <Heading>Provision freigegeben</Heading>

        <Paragraph>Hallo {props.vorname ?? 'Partner'},</Paragraph>

        <Paragraph>
          Ihre Provision für Fall <strong>{fallLabel}</strong> (Kunde: {kunde}) wurde
          nach Ablauf der 14-tägigen Hold-Periode freigegeben und erscheint in Ihrer
          nächsten Monats-Abrechnung.
        </Paragraph>

        <InfoRow label="Fall" value={fallLabel} />
        <InfoRow label="Kunde" value={kunde} />
        <InfoRow label="Service" value={SERVICE_LABEL[props.serviceTyp]} />
        <InfoRow label="Betrag (netto)" value={EUR(props.betrag)} />

        <Paragraph>
          Die Auszahlung erfolgt am 1. des Folgemonats per SEPA auf Ihr hinterlegtes
          Konto.
        </Paragraph>

        <Button href={abrechnungUrl}>Zur Abrechnung →</Button>

        <Note>
          Diese Email können Sie unter Einstellungen → Benachrichtigungen deaktivieren.
        </Note>

        <Paragraph>Ihr Claimondo-Team</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}

export default ProvisionReleasedEmail
