// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, Footer } from '../../components'
import { email } from '../../tokens'
import { Section, Text } from '@react-email/components'

// AAR-494: Email-OTP für 2FA. Grosser monospace-Code, kurzer Sicherheitshinweis.
// Kein Link — der Nutzer tippt den Code im Login-Flow ein, damit Phishing-Links
// per Email nicht ausreichen, um einen Account zu übernehmen.
// P3 Tier-3 (System/Auth): minimal, immer Claimondo, kein Whitelabel/Hero.

type Props = {
  vorname: string | null
  code: string
  gueltigMinuten: number
}

export function subject(_p: Props) {
  return 'Ihr Claimondo-Login-Code'
}

export default function TwoFactorCodeEmail({ vorname, code, gueltigMinuten }: Props) {
  return (
    <EmailShell preview={`Ihr Login-Code: ${code}`}>
      <MailHeader />
      <Card>
        <Heading>Ihr Login-Code</Heading>
        <Paragraph>
          Hallo{vorname ? ` ${vorname}` : ''}, zur Bestätigung Ihrer Anmeldung geben
          Sie bitte den folgenden 6-stelligen Code im Login-Fenster ein.
        </Paragraph>

        <Section style={{
          backgroundColor: email.color.surface,
          borderRadius: email.radius.md,
          padding: '24px 20px',
          textAlign: 'center' as const,
          margin: `${email.space(5)} 0`,
        }}>
          <Text style={{
            color: email.color.navy,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 32,
            fontWeight: 700,
            letterSpacing: '8px',
            margin: 0,
          }}>
            {code}
          </Text>
          <Text style={{ color: email.color.textMuted, fontSize: 12, margin: `${email.space(2)} 0 0` }}>
            Gültig für {gueltigMinuten} Minuten
          </Text>
        </Section>

        <Paragraph>
          <strong>Sicherheitshinweis:</strong> Wir fragen Sie niemals per E-Mail,
          Telefon oder WhatsApp nach diesem Code. Wenn Sie sich nicht gerade
          selbst eingeloggt haben, ignorieren Sie diese E-Mail und ändern Sie
          vorsichtshalber Ihr Passwort.
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
