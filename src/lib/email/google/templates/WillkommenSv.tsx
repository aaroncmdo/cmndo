// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL } from './layout'
import { FOUNDER_AARON_NAME } from '@/lib/seo/brand-constants'

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
    <EmailShell preview={`Willkommen bei Claimondo, ${props.vorname} ${props.nachname}!`}>
      <MailHeader />
      <Card>
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

        <Heading>Deine Konditionen</Heading>
        <InfoRow label="Paket" value={props.paket_name} />
        <InfoRow label="Kontingent" value={`${props.kontingent} Fälle / Monat`} />
        <InfoRow label="Radius" value={`${props.radius_km} km`} />
        <InfoRow label="Anzahlung (= Werbebudget)" value={props.anzahlung_betrag_eur.toLocaleString('de-DE', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0 })} />

        <Heading>Nächste Schritte</Heading>
        <Paragraph>
          <strong>1.</strong> Logge dich ein mit deiner Email-Adresse (an die diese Mail geschickt wurde) und dem Initial-Passwort unten:
        </Paragraph>
        <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(3)} 0` }}>
          <InfoRow label="Login-Adresse" value={loginUrl} />
          <InfoRow label="Initial-Passwort" value={<span style={{ fontFamily: 'monospace' }}>{props.initial_password}</span>} />
        </div>
        <Note>Beim ersten Login wirst du dein Passwort ändern müssen.</Note>

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

        <Paragraph>
          Bei Fragen erreichst du uns unter <strong>aaron.sprafke@claimondo.de</strong>.
        </Paragraph>
        <Paragraph>
          Viele Grüße,<br/>
          {FOUNDER_AARON_NAME}<br/>
          Claimondo GmbH i.G.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
