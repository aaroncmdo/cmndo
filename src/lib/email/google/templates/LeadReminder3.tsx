// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button } from './layout'

// AAR-477 C11: Reminder 3 — 72 Stunden nach Lead-Anlage ohne Fall.
// Ton: Letzte-Chance, kurz. Nach weiteren 4 Tagen wird der Lead
// disqualifiziert — das ist die letzte Mail, die dieser Empfänger bekommt.

export default function LeadReminder3({
  vorname,
  resumeUrl,
}: {
  vorname: string | null
  resumeUrl: string
}) {
  const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    <EmailLayout preview="Letzte Chance: Ihre Schadenmeldung läuft bald ab.">
      <Heading>{anrede}, letzter Anlauf</Heading>
      <Paragraph>
        Ihre Schadenmeldung läuft in den nächsten Tagen ab. Danach können wir
        sie nicht mehr bearbeiten und Sie müssten noch einmal von vorn
        anfangen — das wollen wir Ihnen ersparen.
      </Paragraph>
      <Paragraph>
        Ein Klick, ein paar letzte Angaben, dann regeln wir alles Weitere:
      </Paragraph>
      <Button href={resumeUrl}>Noch fertig melden →</Button>
      <Paragraph>
        Falls Sie Fragen haben oder lieber telefonisch abschließen möchten —
        unsere Hotline hilft gern weiter.
      </Paragraph>
    </EmailLayout>
  )
}
