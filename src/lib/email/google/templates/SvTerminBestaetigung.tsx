import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

// AAR-133: Template unterstützt jetzt sowohl Fall-Termine als auch
// pre-FlowLink-Lead-Reservierungen. Bei istVorreservierung=true wird ein
// expliziter Hinweis angezeigt dass der Kunde die SA noch nicht unterschrieben
// hat. ablehnenUrl ist optional vorbereitet für AAR-134.
type Props = {
  svVorname: string
  fallNummer: string
  terminDatum: string
  terminUhrzeit: string
  kundenName: string
  adresse: string
  istVorreservierung?: boolean
  ablehnenUrl?: string | null
}

export function subject(p: Props) {
  if (p.istVorreservierung) {
    return `Neuer Auftrag (Vorreservierung) — ${p.terminDatum} ${p.terminUhrzeit}`
  }
  return `Neuer Auftrag — ${p.terminDatum} ${p.terminUhrzeit}`
}

export function SvTerminBestaetigungEmail(props: Props) {
  return (
    <EmailLayout preview={`Termin ${props.fallNummer} am ${props.terminDatum}`}>
      <Heading>{props.istVorreservierung ? 'Neue Vorreservierung' : 'Termin automatisch bestätigt'}</Heading>
      <Paragraph>
        Hallo {props.svVorname},{' '}
        {props.istVorreservierung
          ? 'der Dispatcher hat einen Termin für dich vorreserviert. Der Kunde hat die Sicherungsabtretung noch nicht unterschrieben — sobald er das tut, wird der Termin automatisch bestätigt.'
          : 'der folgende Termin wurde automatisch bestätigt. Du musst nichts tun. Falls du nicht kannst: bitte innerhalb von 24 Stunden im Portal ablehnen oder einen Gegenvorschlag machen.'}
      </Paragraph>

      <InfoTable rows={[
        [props.istVorreservierung ? 'Lead' : 'Fall', props.fallNummer],
        ['Datum', props.terminDatum],
        ['Uhrzeit', props.terminUhrzeit + ' Uhr'],
        ['Kunde', props.kundenName],
        ['Adresse', props.adresse],
      ]} />

      {props.istVorreservierung ? (
        <Paragraph>
          Sobald der Kunde die SA unterschrieben hat, erhältst du eine zweite Mail mit der finalen Termin-Bestätigung. Bis dahin: bitte nicht anfahren.
        </Paragraph>
      ) : (
        <Paragraph>
          Nach 24 Stunden ist der Termin final verbindlich und kann nicht mehr abgelehnt werden.
        </Paragraph>
      )}

      <Button href={`${APP_URL}/gutachter/kalender`}>Zum Kalender</Button>

      {props.ablehnenUrl && (
        <Paragraph>
          Falls du diesen Termin nicht annehmen kannst:{' '}
          <a href={props.ablehnenUrl}>Termin ablehnen / Gegenvorschlag machen</a>
        </Paragraph>
      )}
    </EmailLayout>
  )
}
