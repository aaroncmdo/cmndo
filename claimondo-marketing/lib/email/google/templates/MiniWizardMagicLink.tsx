// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, APP_URL, ONDO, type EmailBrand } from './layout'
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
    <EmailLayout preview={s.preview} brand={props.brand} locale={props.locale}>
      <Heading brand={props.brand}>{s.anrede(props.vorname)}</Heading>
      <Paragraph>{s.intro}</Paragraph>
      <Paragraph>{s.ablauf}</Paragraph>
      <Button href={props.flowUrl} brand={props.brand}>
        {s.cta}
      </Button>
      <Paragraph>
        {s.linkHinweisPrefix}
        <a href={APP_URL} style={{ color: ONDO }}>{APP_URL}</a>
        {s.linkHinweisSuffix}
      </Paragraph>
    </EmailLayout>
  )
}
