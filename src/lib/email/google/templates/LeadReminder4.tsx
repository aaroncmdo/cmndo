// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'

// Reminder 4 — Tag 7 (168h) nach Lead-Anlage ohne Fall. Fuellt die Stille-Luecke
// zwischen Reminder 3 (72h) und der Disqualifikation (Timeout jetzt Tag 10).
// Ton: wirklich letzter Anlauf, kurz vor der Schliessung. Die allerletzte Mail.

export default function LeadReminder4({
  vorname,
  resumeUrl,
}: {
  vorname: string | null
  resumeUrl: string
}) {
  const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    <EmailShell preview="In wenigen Tagen schließen wir Ihre Schadenmeldung." dark>
      <Hero logoUrl={null} headline={`${anrede}, wir schließen bald`} />
      <Card>
        <Paragraph>
          Ihre Schadenmeldung ist fast abgelaufen. In den nächsten Tagen schließen
          wir sie automatisch — danach ist Ihr Anspruch über uns nicht mehr
          abrufbar und Sie müssten komplett von vorn beginnen.
        </Paragraph>
        <Paragraph>
          Zwei Minuten genügen, dann übernehmen wir den Rest — bei unverschuldetem
          Unfall für Sie kostenlos:
        </Paragraph>
        <Button href={resumeUrl}>Jetzt abschließen →</Button>
        <Paragraph>
          Lieber telefonisch? Antworten Sie einfach auf diese E-Mail oder rufen Sie
          uns an — wir melden uns umgehend.
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
