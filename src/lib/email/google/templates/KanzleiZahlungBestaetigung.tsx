import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'
import { Text } from '@react-email/components'

// KFZ-188: Zahlungsbestaetigung fuer Kanzlei-Monatsabrechnungen

type Props = {
  ansprechpartner: string
  rechnungsnummer: string
  brutto: string
  bezahltAm: string
}

export function subject(p: Props) {
  return `Zahlung eingegangen — Rechnung ${p.rechnungsnummer}`
}

export function KanzleiZahlungBestaetigungEmail(props: Props) {
  return (
    <EmailLayout preview={`Zahlung ${props.brutto} eingegangen — ${props.rechnungsnummer}`}>
      <Heading>Zahlung eingegangen — Vielen Dank!</Heading>

      <Paragraph>
        Hallo {props.ansprechpartner},
      </Paragraph>
      <Paragraph>
        Ihre Zahlung für die Rechnung <strong>{props.rechnungsnummer}</strong> ist
        eingegangen. Vielen Dank!
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.rechnungsnummer],
        ['Bezahlter Betrag (brutto)', props.brutto],
        ['Bezahlt am', props.bezahltAm],
      ]} />

      <Divider />

      <Paragraph>
        Diese Bestätigung können Sie als Beleg für Ihre Buchhaltung aufbewahren.
        Bei Rückfragen wenden Sie sich bitte an{' '}
        <strong>support@claimondo.de</strong>.
      </Paragraph>

      <Text style={{ color: '#6b7280', fontSize: 11, margin: '16px 0 0' }}>
        Mit freundlichen Grüßen, Ihr Claimondo-Team
      </Text>
    </EmailLayout>
  )
}
