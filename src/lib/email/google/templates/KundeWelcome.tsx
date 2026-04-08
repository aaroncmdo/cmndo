import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, ONDO } from './layout'
import { Text, Section } from '@react-email/components'

type TerminInfo = { datum: string; uhrzeit: string; adresse: string; svName: string | null }

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
  terminInfo?: TerminInfo | null
}

export function subject(p: Props) {
  return `Willkommen bei Claimondo, ${p.vorname}!`
}

export function KundeWelcomeEmail(props: Props) {
  return (
    <EmailLayout preview={`Willkommen bei Claimondo — Ihr Fall ${props.fallNummer}`}>
      <Heading>Willkommen bei Claimondo, {props.vorname}!</Heading>
      <Paragraph>
        Vielen Dank für Ihr Vertrauen. Wir kümmern uns um die komplette Schadensabwicklung nach Ihrem Unfall — <strong>für Sie völlig kostenfrei</strong>.
      </Paragraph>
      <Paragraph>
        Was passiert jetzt? Ein unabhängiger Sachverständiger begutachtet Ihr Fahrzeug, danach übernimmt unsere Partnerkanzlei die Regulierung mit der gegnerischen Versicherung.
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

      {/* BUG-72: Termin-Info Block */}
      {props.terminInfo && (
        <>
          <Divider />
          <Section style={{ marginBottom: 16 }}>
            <Text style={{ color: ONDO, fontSize: 13, fontWeight: 700, margin: '0 0 8px', letterSpacing: '0.5px' }}>
              Ihr Besichtigungstermin
            </Text>
          </Section>
          <InfoTable rows={[
            ['Datum', props.terminInfo.datum],
            ['Uhrzeit', `${props.terminInfo.uhrzeit} Uhr`],
            ['Adresse', props.terminInfo.adresse],
            ...(props.terminInfo.svName ? [['Sachverständiger', props.terminInfo.svName] as [string, string]] : []),
          ]} />
          <Text style={{ color: '#6b7280', fontSize: 12, lineHeight: '18px', margin: '8px 0 0', fontStyle: 'italic' }}>
            Bitte stellen Sie sicher, dass das Fahrzeug zum Termin zugänglich ist. Sie werden kurz vorher per WhatsApp erinnert.
          </Text>
        </>
      )}

      <Divider />
      {props.accountExists ? (
        <>
          <Paragraph>
            In Ihrem Kunden-Portal können Sie den Fortschritt Ihres Falls verfolgen, Dokumente einsehen und direkt mit uns kommunizieren.
          </Paragraph>
          <Button href={`${APP_URL}/kunde`}>Zum Kunden-Portal</Button>
        </>
      ) : (
        <>
          <Paragraph>
            Erstellen Sie jetzt Ihr persönliches Portal-Konto, um den Fortschritt Ihres Falls zu verfolgen und Dokumente einzusehen.
          </Paragraph>
          <Button href={props.flowToken ? `${APP_URL}/flow/${props.flowToken}` : `${APP_URL}/kunde`}>
            {props.flowToken ? 'Konto erstellen' : 'Zum Portal'}
          </Button>
        </>
      )}

      <Paragraph>
        Bei Fragen erreichen Sie uns jederzeit über den Chat im Portal oder per WhatsApp.
      </Paragraph>
    </EmailLayout>
  )
}
