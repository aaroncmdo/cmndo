// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, Note, Footer } from '../../components'
import { APP_URL } from './layout'

type Props = {
  svVorname: string
  fallNummer: string
  terminDatum: string
  terminUhrzeit: string
  adresse: string
  fahrzeug: string
  kundeName: string
  kundeTelefon: string
  versicherung: string
  fallId: string
}

export function subject(p: Props) {
  return `Neuer Auftrag bestätigt: ${p.fallNummer}`
}

export function SvAuftragszusammenfassungEmail(props: Props) {
  return (
    <EmailShell preview={`Neuer Auftrag ${props.fallNummer} — Termin am ${props.terminDatum}`}>
      <MailHeader />
      <Card>
        <Heading>Neuer Auftrag bestätigt</Heading>
        <Paragraph>
          Hallo {props.svVorname}, der Termin für Fall {props.fallNummer} ist bestätigt. Hier die wichtigsten Daten:
        </Paragraph>

        <InfoRow label="Fallnummer" value={props.fallNummer} />
        <InfoRow label="Termin" value={`${props.terminDatum} um ${props.terminUhrzeit} Uhr`} />
        <InfoRow label="Adresse" value={props.adresse} />
        <InfoRow label="Fahrzeug" value={props.fahrzeug} />
        <InfoRow label="Kunde" value={props.kundeName} />
        <InfoRow label="Telefon Kunde" value={props.kundeTelefon} />
        <InfoRow label="Versicherung" value={props.versicherung} />

        <Button href={`${APP_URL}/gutachter/fall/${props.fallId}`}>Fallakte öffnen</Button>

        <Note>
          Die Kommunikation zum Fall läuft primär über WhatsApp. Diese Email dient als schriftliche Zusammenfassung.
        </Note>
      </Card>
      <Footer />
    </EmailShell>
  )
}
