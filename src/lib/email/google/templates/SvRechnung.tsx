import { EmailLayout, Heading, Paragraph, Button, InfoTable, APP_URL } from './layout'

type Props = {
  svVorname: string
  fallNummer: string
  rechnungsNr: string
  rechnungsDatum: string
  betrag: string
  rechnungId: string
}

export function subject(p: Props) {
  return `Rechnung ${p.rechnungsNr} fuer Fall ${p.fallNummer}`
}

export function SvRechnungEmail(props: Props) {
  return (
    <EmailLayout preview={`Rechnung ${props.rechnungsNr} — ${props.betrag}`}>
      <Heading>Ihre Rechnung</Heading>
      <Paragraph>
        Hallo {props.svVorname}, anbei Ihre Rechnung fuer Fall {props.fallNummer} als PDF.
      </Paragraph>

      <InfoTable rows={[
        ['Rechnungs-Nr.', props.rechnungsNr],
        ['Datum', props.rechnungsDatum],
        ['Betrag', props.betrag],
        ['Fall', props.fallNummer],
      ]} />

      <Paragraph>
        Die Rechnung finden Sie auch jederzeit im Portal:
      </Paragraph>
      <Button href={`${APP_URL}/gutachter/abrechnung`}>Im Portal ansehen</Button>
    </EmailLayout>
  )
}
