// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL } from './layout'
import { getGegnerBestaetigungStrings } from './GegnerBestaetigung.i18n'

// T3 (operativer-schaden-flow): Unfallgegner-Bestaetigungs-Magic-Link, Email-Tier der
// WA->SMS->Email-Kaskade (gegner-invite.ts). Claimondo-Branding — der Gegner ist ein
// Dritter, kein SV-Kunde -> kein brand-Prop.

type Props = {
  name: string
  link: string
  locale?: string
}

export function subject(p: Props) {
  return getGegnerBestaetigungStrings(p.locale ?? 'de').subject(p.name)
}

export function GegnerBestaetigungEmail(props: Props) {
  const s = getGegnerBestaetigungStrings(props.locale ?? 'de')
  return (
    <EmailShell preview={s.preview} dark>
      <Hero logoUrl={null} headline={s.anrede(props.name)} />
      <Card>
        <Paragraph>{s.intro}</Paragraph>
        <Paragraph>{s.ablauf}</Paragraph>
        <Button href={props.link}>{s.cta}</Button>
        <Paragraph>
          {s.linkHinweisPrefix}
          <a href={APP_URL} style={{ color: email.color.ondo }}>
            {APP_URL}
          </a>
          {s.linkHinweisSuffix}
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
