// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt Login-/Willkommens-Mail. Claimondo-Standard (Werkstatt = interner Partner,
// kein Whitelabel). Reiner Magic-Link-Weg: der Button "Passwort setzen & einloggen" fuehrt
// auf /passwort-zuruecksetzen, setzt das Passwort und loggt beim Onboarding direkt ins Portal
// ein. Kein Einmalpasswort mehr in der Mail (ein einziger, sicherer Weg).

import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

type Props = {
  werkstattName: string
  email: string
  loginUrl: string
  magicLink: string
}

export function subject(_p: Props): string {
  return 'Willkommen bei Claimondo – Ihr Werkstatt-Zugang'
}

const codeStyle = {
  fontFamily: 'monospace' as const,
  fontSize: '15px',
  color: email.color.navy,
  background: '#f1f4f8',
  padding: '2px 6px',
  borderRadius: '4px',
  wordBreak: 'break-all' as const,
}

export function WillkommenWerkstattEmail({ werkstattName, email: mail, loginUrl, magicLink }: Props) {
  return (
    <EmailShell preview="Ihr Zugang zum Claimondo-Werkstatt-Portal.">
      <Hero logoUrl={null} headline={`Willkommen, ${werkstattName}!`} />
      <Card>
        <Paragraph>
          Ihre Werkstatt wurde auf Claimondo angelegt. Über das Werkstatt-Portal sehen
          Sie vermittelte Aufträge, Besichtigungstermine und Abrechnungen.
        </Paragraph>

        <Button href={magicLink}>Passwort setzen &amp; einloggen</Button>
        <Paragraph>
          Über diesen Button setzen Sie Ihr eigenes Passwort und werden direkt eingeloggt.
          Falls er nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
          <a href={magicLink} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
            {magicLink}
          </a>
        </Paragraph>

        <Paragraph>
          Für spätere Anmeldungen unter{' '}
          <a href={loginUrl} style={{ color: email.color.ondo }}>{loginUrl}</a> nutzen Sie Ihre
          E-Mail-Adresse <span style={codeStyle}>{mail}</span> und Ihr gewähltes Passwort.
        </Paragraph>

        <Paragraph>Der Anmelde-Link ist 24 Stunden gültig.</Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
