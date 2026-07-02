// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt Login-/Willkommens-Mail. Claimondo-Standard (Werkstatt = interner Partner,
// kein Whitelabel). Enthaelt Magic-Link ("Passwort setzen") + — wenn vorhanden —
// Direkt-Login (Login-URL + Email + Einmalpasswort). Ohne Einmalpasswort: Hinweis
// aufs bestehende Passwort.

import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

type Props = {
  werkstattName: string
  email: string
  loginUrl: string
  magicLink: string | null
  einmalpasswort: string | null
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

export function WillkommenWerkstattEmail({ werkstattName, email: mail, loginUrl, magicLink, einmalpasswort }: Props) {
  return (
    <EmailShell preview="Ihr Zugang zum Claimondo-Werkstatt-Portal.">
      <Hero logoUrl={null} headline={`Willkommen, ${werkstattName}!`} />
      <Card>
        <Paragraph>
          Ihre Werkstatt wurde auf Claimondo angelegt. Über das Werkstatt-Portal sehen
          Sie vermittelte Aufträge, Besichtigungstermine und Abrechnungen.
        </Paragraph>

        {magicLink && (
          <>
            <Button href={magicLink}>Passwort setzen &amp; einloggen</Button>
            <Paragraph>
              Falls der Button nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
              <a href={magicLink} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
                {magicLink}
              </a>
            </Paragraph>
          </>
        )}

        <Paragraph>
          <strong>Direkt einloggen</strong> unter{' '}
          <a href={loginUrl} style={{ color: email.color.ondo }}>{loginUrl}</a>:
        </Paragraph>
        <Paragraph>
          E-Mail: <span style={codeStyle}>{mail}</span>
        </Paragraph>
        {einmalpasswort ? (
          <Paragraph>
            Passwort: <span style={codeStyle}>{einmalpasswort}</span>
          </Paragraph>
        ) : (
          <Paragraph>
            Nutzen Sie Ihr bestehendes Passwort. Passwort vergessen? Setzen Sie es über den
            Button oben neu.
          </Paragraph>
        )}

        <Paragraph>
          Bitte ändern Sie Ihr Passwort beim ersten Login. Der Anmelde-Link ist 24 Stunden gültig.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
