import { EmailLayout, Heading, Paragraph, Button, Divider, InfoTable, APP_URL } from './layout'

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
    <EmailLayout preview={`Ihre Provision in Höhe von ${EUR(props.betrag)} wurde freigegeben.`}>
      <Heading>Provision freigegeben</Heading>

      <Paragraph>Hallo {props.vorname ?? 'Partner'},</Paragraph>

      <Paragraph>
        Ihre Provision für Fall <strong>{fallLabel}</strong> (Kunde: {kunde}) wurde
        nach Ablauf der 14-tägigen Hold-Periode freigegeben und erscheint in Ihrer
        nächsten Monats-Abrechnung.
      </Paragraph>

      <InfoTable
        rows={[
          ['Fall', fallLabel],
          ['Kunde', kunde],
          ['Service', SERVICE_LABEL[props.serviceTyp]],
          ['Betrag (netto)', EUR(props.betrag)],
        ]}
      />

      <Paragraph>
        Die Auszahlung erfolgt am 1. des Folgemonats per SEPA auf Ihr hinterlegtes
        Konto.
      </Paragraph>

      <Button href={abrechnungUrl}>Zur Abrechnung →</Button>

      <Divider />

      <Paragraph>
        Diese Email können Sie unter <em>Einstellungen → Benachrichtigungen</em>
        deaktivieren.
      </Paragraph>

      <Paragraph>Ihr Claimondo-Team</Paragraph>
    </EmailLayout>
  )
}

export default ProvisionReleasedEmail
