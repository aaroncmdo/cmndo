// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
// AAR-702: Kunden-Email nach SV-Gegenvorschlag — Magic-Link auf
// /kunde-termin/<token> mit „Annehmen" + „Eigener Vorschlag"-CTAs.
// Kein Login nötig — Token gilt 7 Tage.

import { EmailLayout, Heading, Paragraph, InfoTable, Button, type EmailBrand } from './layout'
import { getKundeTerminGegenvorschlagStrings } from './KundeTerminGegenvorschlag.i18n'

type Props = {
  kundenVorname: string
  fallNummer: string
  alterTerminDatum: string
  alterTerminUhrzeit: string
  neuerTerminDatum: string
  neuerTerminUhrzeit: string
  grund: string | null
  svName: string
  responseUrl: string
  locale: string
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Caller)
  brand?: EmailBrand
}

export function subject(p: Props, locale: string = 'de') {
  const s = getKundeTerminGegenvorschlagStrings(locale)
  return s.subject(p.svName, p.neuerTerminDatum)
}

export function KundeTerminGegenvorschlagEmail(props: Props) {
  const s = getKundeTerminGegenvorschlagStrings(props.locale)
  return (
    <EmailLayout
      preview={s.preview(props.svName, props.neuerTerminDatum, props.neuerTerminUhrzeit)}
      brand={props.brand}
      locale={props.locale}
    >
      <Heading brand={props.brand}>{s.heading}</Heading>
      <Paragraph>{s.begruessung(props.kundenVorname, props.svName)}</Paragraph>

      <InfoTable
        rows={[
          [s.labelFall, props.fallNummer],
          [s.labelUrspruenglicherTermin, s.terminWert(props.alterTerminDatum, props.alterTerminUhrzeit)],
          [s.labelNeuerVorschlag, s.terminWert(props.neuerTerminDatum, props.neuerTerminUhrzeit)],
          ...(props.grund ? ([[s.labelBegruendung, props.grund]] as [string, string][]) : []),
        ]}
      />

      <Paragraph>{s.hinweis}</Paragraph>

      <Button href={props.responseUrl} brand={props.brand}>{s.button}</Button>

      <Paragraph>
        {s.linkFallback}
        <br />
        <a href={props.responseUrl} style={{ color: '#4573A2' }}>
          {props.responseUrl}
        </a>
      </Paragraph>
    </EmailLayout>
  )
}
