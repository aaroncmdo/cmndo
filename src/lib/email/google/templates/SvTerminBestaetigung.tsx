import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

type Props = {
  svVorname: string
  fallNummer: string
  terminDatum: string
  terminUhrzeit: string
  kundenName: string
  adresse: string
}

export function subject(p: Props) {
  return `Termin bestätigt: ${p.fallNummer} am ${p.terminDatum}`
}

export function SvTerminBestaetigungEmail(props: Props) {
  return (
    <EmailLayout preview={`Termin ${props.fallNummer} am ${props.terminDatum} bestätigt`}>
      <Heading>Termin automatisch bestätigt</Heading>
      <Paragraph>
        Hallo {props.svVorname}, der folgende Termin wurde automatisch bestätigt.
        Du musst nichts tun. Falls du nicht kannst: bitte innerhalb von 24 Stunden
        im Portal ablehnen oder einen Gegenvorschlag machen.
      </Paragraph>

      <InfoTable rows={[
        ['Fall', props.fallNummer],
        ['Datum', props.terminDatum],
        ['Uhrzeit', props.terminUhrzeit + ' Uhr'],
        ['Kunde', props.kundenName],
        ['Adresse', props.adresse],
      ]} />

      <Paragraph>
        Nach 24 Stunden ist der Termin final verbindlich und kann nicht mehr abgelehnt werden.
      </Paragraph>

      <Button href={`${APP_URL}/gutachter/kalender`}>Zum Kalender</Button>
    </EmailLayout>
  )
}
