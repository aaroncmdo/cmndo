// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, InfoTable, APP_URL, ONDO, type EmailBrand } from './layout'
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
    <EmailLayout preview={s.preview(props.svVorname, props.svNachname)} brand={props.brand} locale={props.locale}>
      <Heading brand={props.brand}>{s.greeting(props.vorname)}</Heading>
      <Paragraph>
        {s.intro}
      </Paragraph>
      <Paragraph>
        <strong>{s.terminLabel}</strong>
      </Paragraph>
      <InfoTable
        rows={[
          [s.labelSachverstaendiger, `${props.svVorname} ${props.svNachname}`],
          [s.labelDatum, props.terminDatum],
          [s.labelUhrzeit, props.terminUhrzeit],
        ]}
      />
      <Paragraph>
        {s.linkIntro}
      </Paragraph>
      <Button href={props.flowUrl} brand={props.brand}>{s.buttonOeffnen}</Button>
      <Paragraph>
        {s.linkGueltigPre}<a href={APP_URL} style={{ color: ONDO }}>{APP_URL}</a>{s.linkGueltigSuf}
      </Paragraph>
    </EmailLayout>
  )
}
