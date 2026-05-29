// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'

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
    <EmailShell preview="Letzte Chance: Ihre Schadenmeldung läuft bald ab." dark>
      <Hero logoUrl={null} headline={`${anrede}, letzter Anlauf`} />
      <Card>
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
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
