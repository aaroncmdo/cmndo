import { EmailLayout, Heading, Paragraph, InfoTable, Button, APP_URL } from './layout'

// AAR-134: Email an den Dispatcher wenn ein SV einen Gegenvorschlag macht.
type Props = {
  svName: string
  kundenName: string
  originalDatum: string
  originalUhrzeit: string
  slots: { datum: string; uhrzeit: string }[]
  begruendung: string | null
  leadId: string | null
  fallId: string | null
}

export function subject(p: Props) {
  return `SV-Gegenvorschlag: ${p.svName} — ${p.slots.length} alternative Termine`
}

export function DispatcherGegenvorschlagEmail(props: Props) {
  const targetUrl = props.fallId
    ? `${APP_URL}/faelle/${props.fallId}`
    : props.leadId
      ? `${APP_URL}/dispatch/leads/${props.leadId}`
      : `${APP_URL}/dispatch/leads`

  return (
    <EmailLayout preview={`SV-Gegenvorschlag von ${props.svName}`}>
      <Heading>Sachverständiger schlägt andere Termine vor</Heading>
      <Paragraph>
        <strong>{props.svName}</strong> kann den ursprünglichen Termin am {props.originalDatum} um {props.originalUhrzeit} Uhr nicht wahrnehmen
        und schlägt {props.slots.length} alternative Termine vor.
      </Paragraph>

      <InfoTable rows={[
        ['Sachverständiger', props.svName],
        ['Kunde', props.kundenName],
        ['Original-Termin', `${props.originalDatum} um ${props.originalUhrzeit} Uhr`],
      ]} />

      <Heading>Vorgeschlagene Termine</Heading>
      <InfoTable rows={props.slots.map((s, i) => [`Slot ${i + 1}`, `${s.datum} um ${s.uhrzeit} Uhr`])} />

      {props.begruendung && (
        <Paragraph>Begründung: {props.begruendung}</Paragraph>
      )}

      <Button href={targetUrl}>
        {props.fallId ? 'Zur Fallakte' : 'Zum Lead'} — Slot wählen
      </Button>
    </EmailLayout>
  )
}
