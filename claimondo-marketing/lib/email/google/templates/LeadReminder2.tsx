// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button } from './layout'

// AAR-477 C11: Reminder 2 — 24 Stunden nach Lead-Anlage ohne Fall.
// Ton: etwas direkter, Nutzen-Betonung: „der Gegner zahlt".

export default function LeadReminder2({
  vorname,
  resumeUrl,
}: {
  vorname: string | null
  resumeUrl: string
}) {
  const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    <EmailLayout preview="Sollen wir Ihren Schadenfall noch bearbeiten?">
      <Heading>{anrede}, sollen wir weitermachen?</Heading>
      <Paragraph>
        Ihre Schadenmeldung liegt bei uns — aber sie ist noch nicht
        abgeschlossen. Für Sie gilt: <strong>0 € Kosten</strong>, wir
        beauftragen einen unabhängigen Gutachter und die Regulierung läuft
        über die gegnerische Versicherung.
      </Paragraph>
      <Paragraph>
        Je eher Sie abschließen, desto schneller bekommen Sie Ihren Termin:
      </Paragraph>
      <Button href={resumeUrl}>Jetzt abschließen →</Button>
      <Paragraph>
        Nach dem Klick brauchen Sie nur noch Ihre letzten Angaben zu ergänzen
        — alles was Sie bereits eingegeben haben, ist gespeichert.
      </Paragraph>
    </EmailLayout>
  )
}
