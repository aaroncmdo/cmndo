import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL } from './layout'

type Props = {
  fallNummer: string
  kundeName: string
  unfallDatum: string
  unfallOrt: string
  fahrzeug: string
  versicherung: string
  schadennummer: string
  svBerichtHinweis: string
  uebergabeDatum: string
  fallId: string
}

export function subject(p: Props) {
  return `Neuer Fall zur Bearbeitung: ${p.fallNummer}`
}

export function KanzleiAuftragszusammenfassungEmail(props: Props) {
  return (
    <EmailLayout preview={`Neuer Fall ${props.fallNummer} — ${props.kundeName}`}>
      <Heading>Neuer Fall zur Bearbeitung: {props.fallNummer}</Heading>
      <Paragraph>
        Ein neuer Fall wurde nach erfolgreicher Qualitätsprüfung an Ihre Kanzlei übergeben.
      </Paragraph>

      <InfoTable rows={[
        ['Fallnummer', props.fallNummer],
        ['Mandant', props.kundeName],
        ['Unfalldatum', props.unfallDatum],
        ['Unfallort', props.unfallOrt],
        ['Fahrzeug', props.fahrzeug],
        ['Gegn. Versicherung', props.versicherung],
        ['Schadennummer', props.schadennummer],
        ['Übergabe am', props.uebergabeDatum],
      ]} />

      <Paragraph>{props.svBerichtHinweis}</Paragraph>

      <Button href={`${APP_URL}/admin/faelle/${props.fallId}`}>Fallakte im Portal öffnen</Button>

      <Divider />
      <Paragraph>
        Alle relevanten Dokumente (Gutachten, Fahrzeugschein, Schadensfotos, SA-Vollmacht) finden Sie in der digitalen Fallakte.
      </Paragraph>
    </EmailLayout>
  )
}
