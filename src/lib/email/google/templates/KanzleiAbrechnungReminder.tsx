import { EmailLayout, Heading, Paragraph, InfoTable, Button, Divider } from './layout'
import { Text } from '@react-email/components'

// KFZ-188: Erinnerungs-Mail fuer offene Kanzlei-Monatsabrechnungen

type Props = {
  ansprechpartner: string
  rechnungsnummer: string
  brutto: string
  faelligAm: string
  magicLinkUrl: string
  reminderStufe: 'freundlich' | 'dringend' | 'mahnung'
}

export function subject(p: Props) {
  switch (p.reminderStufe) {
    case 'freundlich':
      return `Erinnerung: Rechnung ${p.rechnungsnummer} — Zahlbar bis ${p.faelligAm}`
    case 'dringend':
      return `Dringende Erinnerung: Rechnung ${p.rechnungsnummer} — Morgen fällig`
    case 'mahnung':
      return `Mahnung: Rechnung ${p.rechnungsnummer} — Zahlungsfrist überschritten`
  }
}

export function KanzleiAbrechnungReminderEmail(props: Props) {
  const isMahnung = props.reminderStufe === 'mahnung'
  const isDringend = props.reminderStufe === 'dringend'

  const headingText = isMahnung
    ? 'Mahnung — Zahlungsfrist überschritten'
    : isDringend
    ? 'Dringende Zahlungserinnerung'
    : 'Freundliche Zahlungserinnerung'

  const bodyText = isMahnung
    ? `die Zahlungsfrist für die Rechnung ${props.rechnungsnummer} über ${props.brutto} ist überschritten. Bitte begleichen Sie den offenen Betrag umgehend, um weitere Maßnahmen zu vermeiden.`
    : isDringend
    ? `die Rechnung ${props.rechnungsnummer} über ${props.brutto} ist morgen fällig (${props.faelligAm}). Bitte veranlassen Sie die Zahlung noch heute.`
    : `kurze Erinnerung: die Rechnung ${props.rechnungsnummer} über ${props.brutto} ist am ${props.faelligAm} zahlbar. Bitte nutzen Sie den untenstehenden Link zur bequemen Online-Zahlung.`

  return (
    <EmailLayout preview={`${headingText} — Rechnung ${props.rechnungsnummer}`}>
      <Heading>{headingText}</Heading>

      <Paragraph>
        Hallo {props.ansprechpartner},
      </Paragraph>
      <Paragraph>
        {bodyText}
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.rechnungsnummer],
        ['Offener Betrag (brutto)', props.brutto],
        ['Fällig am', props.faelligAm],
      ]} />

      <Button href={props.magicLinkUrl}>
        {isMahnung ? 'Jetzt sofort bezahlen' : 'Jetzt online bezahlen'}
      </Button>

      {isMahnung && (
        <>
          <Divider />
          <Text style={{ color: '#dc2626', fontSize: 13, margin: '8px 0', fontWeight: 'bold' }}>
            Bei ausbleibender Zahlung behalten wir uns vor, rechtliche Schritte einzuleiten.
            Bitte kontaktieren Sie uns unter aaron.sprafke@claimondo.de falls es Rückfragen gibt.
          </Text>
        </>
      )}

      <Text style={{ color: '#6b7280', fontSize: 11, margin: '16px 0 0' }}>
        Mit freundlichen Grüßen, Ihr Claimondo-Team
      </Text>
    </EmailLayout>
  )
}
