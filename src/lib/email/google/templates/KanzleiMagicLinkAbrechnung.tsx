import { EmailLayout, Heading, Paragraph, InfoTable, Button, Divider } from './layout'
import { Text } from '@react-email/components'

// KFZ-188: Kanzlei-Monatsabrechnung mit Magic-Link zur Online-Zahlung

type Props = {
  ansprechpartner: string
  rechnungsnummer: string
  monat: string           // z.B. "März 2026"
  anzahl: number
  nettoGesamt: string     // "3.000,00 €"
  mwstBetrag: string      // "570,00 €"
  brutto: string          // "3.570,00 €"
  faelligAm: string       // "24.04.2026"
  magicLinkUrl: string
  magicLinkExpiresAm: string
}

export function subject(p: Props) {
  return `Sammelrechnung Vollmachts-Provisionen ${p.monat} — Claimondo`
}

export function KanzleiMagicLinkAbrechnungEmail(props: Props) {
  return (
    <EmailLayout preview={`Rechnung ${props.rechnungsnummer} — ${props.brutto} — fällig am ${props.faelligAm}`}>
      <Heading>Monatsabrechnung {props.monat}</Heading>

      <Paragraph>
        Hallo {props.ansprechpartner},
      </Paragraph>
      <Paragraph>
        anbei Ihre Sammelrechnung für Vollmachts-Provisionen im Monat <strong>{props.monat}</strong>.
        Bitte begleichen Sie den ausstehenden Betrag bis zum <strong>{props.faelligAm}</strong> über
        den untenstehenden Zahlungslink.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungsnummer', props.rechnungsnummer],
        ['Leistungszeitraum', props.monat],
        ['Anzahl Vollmachten', String(props.anzahl)],
        ['Nettobetrag', props.nettoGesamt],
        ['MwSt. (19 %)', props.mwstBetrag],
        ['Bruttobetrag', props.brutto],
        ['Fällig am', props.faelligAm],
      ]} />

      <Button href={props.magicLinkUrl}>Jetzt online bezahlen</Button>

      <Divider />

      <Paragraph>
        <strong>Hinweis zum Anhang:</strong> Die vollständige Rechnung mit allen Positionen finden
        Sie als PDF im Anhang dieser E-Mail.
      </Paragraph>

      <Text style={{ color: '#6b7280', fontSize: 12, margin: '8px 0', fontStyle: 'italic' }}>
        Der Zahlungslink ist gültig bis zum {props.magicLinkExpiresAm}. Nach Ablauf dieser Frist
        wenden Sie sich bitte an aaron.sprafke@claimondo.de.
      </Text>

      <Text style={{ color: '#6b7280', fontSize: 11, margin: '12px 0 0' }}>
        Mit freundlichen Grüßen, Ihr Claimondo-Team
      </Text>
    </EmailLayout>
  )
}
