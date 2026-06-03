// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, Hero, Card, Paragraph, InfoRow, Button, Footer } from '../../components'
import { email } from '../../tokens'
import { APP_URL, type EmailBrand } from './layout'
import { getFlowLinkVersandStrings } from './FlowLinkVersand.i18n'

// AAR-141 / W7: FlowLink-Versand per Email. Alternative zum Standard-WA-Versand
// wenn der Kunde keine WhatsApp-Nummer hat oder explizit Email präferiert.

type Props = {
  vorname: string
  svVorname: string
  svNachname: string
  terminDatum: string
  terminUhrzeit: string
  flowUrl: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Flow)
  brand?: EmailBrand
  // i18n: Empfänger-Sprache (de=Fallback)
  locale: string
}

export function subject(p: Props, locale: string = 'de') {
  return getFlowLinkVersandStrings(locale).subject(p.vorname)
}

export function FlowLinkVersandEmail(props: Props) {
  const s = getFlowLinkVersandStrings(props.locale)
  return (
    <EmailShell preview={s.preview(props.svVorname, props.svNachname)} dark>
      <Hero
        logoUrl={props.brand?.logoUrl ?? null}
        logoText={props.brand?.firmenname ?? undefined}
        headline={s.greeting(props.vorname)}
      />
      <Card>
        <Paragraph>{s.intro}</Paragraph>
        <Paragraph><strong>{s.terminLabel}</strong></Paragraph>
        <InfoRow label={s.labelSachverstaendiger} value={`${props.svVorname} ${props.svNachname}`} />
        <InfoRow label={s.labelDatum} value={props.terminDatum} />
        <InfoRow label={s.labelUhrzeit} value={props.terminUhrzeit} />
        <Paragraph>{s.linkIntro}</Paragraph>
        <Button href={props.flowUrl} bg={props.brand?.primary}>{s.buttonOeffnen}</Button>
        <Paragraph>
          {s.linkGueltigPre}<a href={APP_URL} style={{ color: email.color.ondo }}>{APP_URL}</a>{s.linkGueltigSuf}
        </Paragraph>
      </Card>
      <Footer onDark />
    </EmailShell>
  )
}
