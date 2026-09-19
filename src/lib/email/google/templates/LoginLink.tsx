// Token-Audit-Skip: react-email braucht Inline-Farben (kein Tailwind im Mail-Client).
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// Anmelde-Link fuer den Login ohne FlowLink (Soll-Blatt
// 2026-09-19-kunde-kommt-ohne-link-ins-konto, Weg 2 per E-Mail). Muster: PasswortReset.tsx —
// die Anrede ist die Hero-Headline (Hero verlangt logoUrl + headline).
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'

type Props = { vorname: string | null; actionUrl: string }

export function subject(_p: Props): string {
  return 'Ihr Anmelde-Link für Claimondo'
}

export function LoginLinkEmail({ vorname, actionUrl }: Props) {
  const anrede = vorname ? `Hallo ${vorname},` : 'Hallo,'
  return (
    <EmailShell preview="Mit einem Klick in Ihren Schadensfall">
      <Hero logoUrl={null} headline={anrede} />
      <Card>
        <Paragraph>
          Sie haben sich mit dieser E-Mail-Adresse bei Claimondo angemeldet. Mit dem Knopf unten kommen Sie direkt in
          Ihren Schadensfall — ohne Passwort.
        </Paragraph>
        <Button href={actionUrl}>Jetzt anmelden</Button>
        <Paragraph>
          Falls der Knopf nicht funktioniert, kopieren Sie diesen Link in Ihren Browser:{' '}
          <a href={actionUrl} style={{ color: email.color.ondo, wordBreak: 'break-all' as const }}>
            {actionUrl}
          </a>
        </Paragraph>
        <Paragraph>
          Der Link ist eine Stunde gültig und kann nur einmal verwendet werden. Falls Sie diese Anmeldung nicht
          angefordert haben, können Sie die E-Mail ignorieren.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
