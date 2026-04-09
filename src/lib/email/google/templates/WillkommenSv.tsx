import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL } from './layout'
import { Text } from '@react-email/components'

// ARCH-1 Phase 2 (BLOCK D): Welcome-Mail an einen vom Admin angelegten SV.
// Template-Variablen werden vom Server-Action anlegeSv() befuellt.

type Props = {
  // ARCH-1 POLISH: Anrede + Titel fuer 'Hallo Herr Dr. Mustermann'-Salutation
  anrede?: string
  titel?: string
  vorname: string
  nachname: string
  paket_name: string
  kontingent: number
  radius_km: number
  anzahlung_betrag_eur: number
  login_url?: string
  initial_password: string
  organisation_name?: string | null
  rolle_in_organisation?: string | null
  von_admin_name?: string  // Name des Admins der angelegt hat (Aaron / Nicolas)
}

/**
 * 'Hallo Herr Dr. Mustermann' wenn Anrede + Nachname gesetzt sind, mit Titel
 * dazwischen falls vorhanden. Bei 'Keine Angabe' oder fehlender Anrede:
 * Fallback auf Vorname ('Hallo Max').
 */
function buildSalutation(p: Pick<Props, 'anrede' | 'titel' | 'vorname' | 'nachname'>): string {
  if (p.anrede && p.anrede !== 'Keine Angabe' && p.nachname) {
    const titelTeil = p.titel ? `${p.titel} ` : ''
    return `Hallo ${p.anrede} ${titelTeil}${p.nachname}`
  }
  return `Hallo ${p.vorname}`
}

export function subject(p: Props) {
  return `Willkommen bei Claimondo, ${p.vorname}!`
}

export function WillkommenSvEmail(props: Props) {
  const loginUrl = props.login_url ?? `${APP_URL}/login`
  const isSubSv = !!props.organisation_name
  const salutation = buildSalutation(props)

  return (
    <EmailLayout preview={`Willkommen bei Claimondo, ${props.vorname} ${props.nachname}!`}>
      <Heading>{salutation}!</Heading>
      <Paragraph>
        {props.von_admin_name
          ? `${props.von_admin_name} hat deinen Account bei Claimondo angelegt.`
          : 'Dein Account bei Claimondo wurde angelegt.'}
        {' '}Schön dass du dabei bist!
      </Paragraph>

      {isSubSv && (
        <Paragraph>
          Du wurdest dem Büro <strong>{props.organisation_name}</strong> als{' '}
          {props.rolle_in_organisation ?? 'Mitarbeiter'} hinzugefügt.
        </Paragraph>
      )}

      <Divider />
      <Heading>Deine Konditionen</Heading>
      <InfoTable rows={[
        ['Paket', props.paket_name],
        ['Kontingent', `${props.kontingent} Fälle / Monat`],
        ['Radius', `${props.radius_km} km`],
        ['Anzahlung (= Werbebudget)', `${props.anzahlung_betrag_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })}`],
      ]} />

      <Divider />
      <Heading>Nächste Schritte</Heading>
      <Paragraph>
        <strong>1.</strong> Logge dich ein mit deiner Email-Adresse (an die diese Mail geschickt wurde) und dem Initial-Passwort unten:
      </Paragraph>
      <InfoTable rows={[
        ['Login-Adresse', loginUrl],
        ['Initial-Passwort', props.initial_password],
      ]} />
      <Text style={{ color: '#6b7280', fontSize: 12, margin: '4px 0 16px', fontStyle: 'italic' }}>
        Beim ersten Login wirst du dein Passwort ändern müssen.
      </Text>

      <Paragraph>
        <strong>2.</strong> Du siehst deine vollständigen Konditionen, kannst den Vertrag unterzeichnen und die Anzahlung leisten.
      </Paragraph>

      {!isSubSv && (
        <Paragraph>
          <strong>3.</strong> Sobald die Anzahlung eingegangen ist, ist dein Portal-Zugang freigeschaltet und du kannst Aufträge erhalten.
        </Paragraph>
      )}

      {isSubSv && (
        <Paragraph>
          <strong>3.</strong> Dein Büro-Inhaber unterzeichnet den Vertrag stellvertretend und leistet die zentrale Anzahlung. Sobald das passiert ist, ist auch dein Portal-Zugang freigeschaltet.
        </Paragraph>
      )}

      <Button href={loginUrl}>Jetzt einloggen</Button>

      <Divider />
      <Paragraph>
        Bei Fragen erreichst du uns unter <strong>support@claimondo.de</strong>.
      </Paragraph>
      <Paragraph>
        Viele Grüße,<br/>
        Aaron Sprafke<br/>
        Claimondo GmbH i.G.
      </Paragraph>
    </EmailLayout>
  )
}
