// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL } from './layout'

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
    <EmailLayout preview={`Neuer Auftrag ${props.fallNummer} — Termin am ${props.terminDatum}`}>
      <Heading>Neuer Auftrag bestätigt</Heading>
      <Paragraph>
        Hallo {props.svVorname}, der Termin für Fall {props.fallNummer} ist bestätigt. Hier die wichtigsten Daten:
      </Paragraph>

      <InfoTable rows={[
        ['Fallnummer', props.fallNummer],
        ['Termin', `${props.terminDatum} um ${props.terminUhrzeit} Uhr`],
        ['Adresse', props.adresse],
        ['Fahrzeug', props.fahrzeug],
        ['Kunde', props.kundeName],
        ['Telefon Kunde', props.kundeTelefon],
        ['Versicherung', props.versicherung],
      ]} />

      <Button href={`${APP_URL}/gutachter/fall/${props.fallId}`}>Fallakte öffnen</Button>

      <Divider />
      <Paragraph>
        Die Kommunikation zum Fall läuft primär über WhatsApp. Diese Email dient als schriftliche Zusammenfassung.
      </Paragraph>
    </EmailLayout>
  )
}
