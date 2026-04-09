import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

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
    <EmailLayout preview={`Abrechnung ${props.abrechnungsNr} — ${props.summeBrutto}`}>
      <Heading>Deine Monatsabrechnung</Heading>
      <Paragraph>
        Hallo {props.empfaengerName}, anbei deine Abrechnung für {props.monat}.
        Der Gesamtbetrag von {props.summeBrutto} ist bis zum {props.faelligAm} zahlbar
        auf das im PDF angegebene Konto.
      </Paragraph>

      <InfoTable rows={[
        ['Abrechnungs-Nr', props.abrechnungsNr],
        ['Zeitraum', props.monat],
        ['Positionen', String(props.anzahlPositionen)],
        ['Gesamtbetrag (brutto)', props.summeBrutto],
        ['Zahlbar bis', props.faelligAm],
      ]} />

      <Paragraph>
        Die detaillierte Abrechnung findest du im angehängten PDF.
      </Paragraph>

      <Button href={`${APP_URL}/admin/finance`}>Zum Finance-Dashboard</Button>
    </EmailLayout>
  )
}
