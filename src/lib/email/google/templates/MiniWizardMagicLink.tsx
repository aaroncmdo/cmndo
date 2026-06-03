// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, Button, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL, type EmailBrand } from './layout'
import { getMiniWizardMagicLinkStrings } from './MiniWizardMagicLink.i18n'

// AAR-902 Prototyp: Magic-Link-Versand nach Mini-Wizard. Anders als
// FlowLinkVersand kein SV / Termin notwendig — die Felder werden erst im
// Onboarding nach Login eingegeben. Daher minimaler Template-Variablen-Satz.

type Props = {
  vorname: string
  flowUrl: string
  locale: string
  brand?: EmailBrand
}

export function subject(p: Props, locale: string = 'de') {
  return getMiniWizardMagicLinkStrings(locale).subject(p.vorname)
}

export function MiniWizardMagicLinkEmail(props: Props) {
  const s = getMiniWizardMagicLinkStrings(props.locale)
  return (
    <EmailShell preview={s.preview} dark>
      <Hero
        logoUrl={props.brand?.logoUrl ?? null}
        logoText={props.brand?.firmenname ?? undefined}
        headline={s.anrede(props.vorname)}
      />
      <Card>
        <Paragraph>{s.intro}</Paragraph>
        <Paragraph>{s.ablauf}</Paragraph>
        <Button href={props.flowUrl} bg={props.brand?.primary}>{s.cta}</Button>
        <Paragraph>
          {s.linkHinweisPrefix}
          <a href={APP_URL} style={{ color: email.color.ondo }}>{APP_URL}</a>
          {s.linkHinweisSuffix}
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
