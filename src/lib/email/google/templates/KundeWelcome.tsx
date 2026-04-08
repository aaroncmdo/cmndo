import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL } from './layout'

type Props = {
  vorname: string
  fallNummer: string
  unfallDatum: string
  adresse: string
  fahrzeug: string
  versicherung: string
  svName: string | null
  accountExists: boolean
  flowToken?: string | null
}

export function subject(p: Props) {
  return `Willkommen bei Claimondo, ${p.vorname}!`
}

export function KundeWelcomeEmail(props: Props) {
  return (
    <EmailLayout preview={`Willkommen bei Claimondo — Ihr Fall ${props.fallNummer}`}>
      <Heading>Willkommen bei Claimondo, {props.vorname}!</Heading>
      <Paragraph>
        Vielen Dank fuer Ihr Vertrauen. Wir kuemmern uns um die komplette Schadensabwicklung nach Ihrem Unfall — <strong>fuer Sie voellig kostenfrei</strong>.
      </Paragraph>
      <Paragraph>
        Was passiert jetzt? Ein unabhaengiger Sachverstaendiger begutachtet Ihr Fahrzeug, danach uebernimmt unsere Partnerkanzlei die Regulierung mit der gegnerischen Versicherung.
      </Paragraph>

      <Divider />
      <Heading>Ihre Auftragszusammenfassung</Heading>
      <InfoTable rows={[
        ['Fallnummer', props.fallNummer],
        ['Unfalldatum', props.unfallDatum],
        ['Adresse', props.adresse],
        ['Fahrzeug', props.fahrzeug],
        ['Versicherung', props.versicherung],
        ...(props.svName ? [['Gutachter', props.svName] as [string, string]] : []),
      ]} />

      <Divider />
      {props.accountExists ? (
        <>
          <Paragraph>
            In Ihrem Kunden-Portal koennen Sie den Fortschritt Ihres Falls verfolgen, Dokumente einsehen und direkt mit uns kommunizieren.
          </Paragraph>
          <Button href={`${APP_URL}/kunde`}>Zum Kunden-Portal</Button>
        </>
      ) : (
        <>
          <Paragraph>
            Erstellen Sie jetzt Ihr persoenliches Portal-Konto, um den Fortschritt Ihres Falls zu verfolgen und Dokumente einzusehen.
          </Paragraph>
          <Button href={props.flowToken ? `${APP_URL}/flow/${props.flowToken}` : `${APP_URL}/kunde`}>
            {props.flowToken ? 'Konto erstellen' : 'Zum Portal'}
          </Button>
        </>
      )}

      <Paragraph>
        Bei Fragen erreichen Sie uns jederzeit ueber den Chat im Portal oder per WhatsApp.
      </Paragraph>
    </EmailLayout>
  )
}
