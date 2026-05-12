import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, ONDO, type EmailBrand } from './layout'
import { Text, Section, Row, Column, Hr } from '@react-email/components'

type TerminInfo = { datum: string; uhrzeit: string; adresse: string; svName: string | null }

// AAR-127: Login-Info für Magic-Link + Email/Passwort-Block
export type LoginInfo = {
  magicLink: string | null
  email: string
  password: string
}

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
  // AAR-127: wenn gesetzt, wird Magic-Link-Button + Zugangsdaten-Block gerendert
  loginInfo?: LoginInfo | null
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Flow wenn SV verifiziert+branded)
  brand?: EmailBrand
}

export function subject(p: Props) {
  return `Willkommen bei Claimondo, ${p.vorname}!`
}

export function KundeWelcomeEmail(props: Props) {
  return (
    <EmailLayout preview={`Willkommen bei Claimondo — Ihr Fall ${props.fallNummer}`} brand={props.brand}>
      <Heading brand={props.brand}>Willkommen bei Claimondo, {props.vorname}!</Heading>
      <Paragraph>
        Vielen Dank für Ihr Vertrauen. Wir kümmern uns um die komplette Schadensabwicklung nach Ihrem Unfall — <strong>für Sie völlig kostenfrei</strong>.
      </Paragraph>
      <Paragraph>
        Was passiert jetzt? Ein unabhängiger Sachverständiger begutachtet Ihr Fahrzeug, danach übernimmt unsere Partnerkanzlei die Regulierung mit der gegnerischen Versicherung.
      </Paragraph>

      <Divider />
      <Heading brand={props.brand}>Ihre Auftragszusammenfassung</Heading>
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
      {/* AAR-127: Login-Info hat Vorrang vor accountExists/flowToken — wenn der
          Account gerade frisch angelegt wurde, schicken wir Magic-Link UND
          Zugangsdaten als Fallback. */}
      {props.loginInfo ? (
        <>
          <Paragraph>
            Ihr persönliches Portal-Konto ist eingerichtet. Sie können sich jetzt einloggen.
          </Paragraph>

          {/* Primärer CTA: Magic-Link */}
          {props.loginInfo.magicLink && (
            <Section style={{ textAlign: 'center', padding: '24px 0' }}>
              <Button href={props.loginInfo.magicLink} brand={props.brand}>Jetzt einloggen</Button>
              <Text style={{ fontSize: 12, color: '#666', margin: '8px 0 0' }}>
                Dieser Link loggt Sie automatisch ein. Er ist 1 Stunde gültig.
              </Text>
            </Section>
          )}

          {/* Fallback: Zugangsdaten als Text */}
          <Section style={{ backgroundColor: '#f8f9fb', padding: '16px', borderRadius: '8px' }}>
            <Text style={{ fontSize: 13, color: ONDO, fontWeight: 700, margin: 0 }}>
              Ihre Zugangsdaten
            </Text>
            <Text style={{ fontSize: 12, color: '#666', margin: '4px 0 12px' }}>
              Falls Sie den Login-Button nicht nutzen, können Sie sich auch klassisch anmelden:
            </Text>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>Portal:</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, margin: 0 }}>
                  <a href={`${APP_URL}/login`}>{APP_URL.replace(/^https?:\/\//, '')}/login</a>
                </Text>
              </Column>
            </Row>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>E-Mail:</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, fontFamily: 'monospace', margin: 0 }}>
                  {props.loginInfo.email}
                </Text>
              </Column>
            </Row>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>Passwort:</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, fontFamily: 'monospace', margin: 0 }}>
                  {props.loginInfo.password}
                </Text>
              </Column>
            </Row>
            <Text style={{ fontSize: 11, color: '#666', margin: '12px 0 0', fontStyle: 'italic' }}>
              Wir empfehlen Ihnen, das Passwort nach dem ersten Login in den Einstellungen zu ändern.
            </Text>
          </Section>
          <Hr />
        </>
      ) : props.accountExists ? (
        <>
          <Paragraph>
            In Ihrem Kunden-Portal können Sie den Fortschritt Ihres Falls verfolgen, Dokumente einsehen und direkt mit uns kommunizieren.
          </Paragraph>
          <Button href={`${APP_URL}/kunde`} brand={props.brand}>Zum Kunden-Portal</Button>
        </>
      ) : (
        <>
          <Paragraph>
            Erstellen Sie jetzt Ihr persönliches Portal-Konto, um den Fortschritt Ihres Falls zu verfolgen und Dokumente einzusehen.
          </Paragraph>
          <Button href={props.flowToken ? `${APP_URL}/flow/${props.flowToken}` : `${APP_URL}/kunde`} brand={props.brand}>
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
