// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Note, Footer } from '../../components'

// Win-back: einmalige Reaktivierung erreichbarer TOTER Leads (kalt / Timeout-disq),
// die den Schaden-melden-Flow begonnen, aber nie abgeschlossen haben. Bewusst
// Service-Framing (kein kaltes Marketing) + Pflicht-Opt-out (UWG). Resume-Link =
// bestehender /schaden-melden/fortsetzen/[token]-Pfad.

export default function LeadWinback({
  vorname,
  resumeUrl,
  optOutUrl,
}: {
  vorname: string | null
  resumeUrl: string
  optOutUrl: string
}) {
  const anrede = vorname ? `Hallo ${vorname}` : 'Hallo'
  return (
    <EmailShell preview="Ihre Schadenmeldung wartet noch auf Sie" dark>
      <Hero logoUrl={null} headline={`${anrede}, Ihre Schadenmeldung wartet noch`} />
      <Card>
        <Paragraph>
          Sie hatten vor einiger Zeit begonnen, Ihren Kfz-Schaden bei uns zu
          melden — abgeschlossen wurde die Meldung aber nie. Falls sich der
          Schaden noch nicht erledigt hat, können wir ihn weiterhin für Sie
          übernehmen.
        </Paragraph>
        <Paragraph>
          Für Sie gilt: <strong>0 € Kosten</strong> — wir beauftragen einen
          unabhängigen Gutachter, die Regulierung läuft über die gegnerische
          Versicherung. Ihre bereits eingegebenen Angaben sind gespeichert.
        </Paragraph>
        <Button href={resumeUrl}>Schadenmeldung abschließen →</Button>
        <Note>
          Kein Interesse mehr?{' '}
          <a href={optOutUrl} style={{ color: '#7BA3CC', textDecoration: 'underline' }}>
            Hier abmelden
          </a>{' '}
          — dann hören Sie nichts mehr von uns.
        </Note>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
