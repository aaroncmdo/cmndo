// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL, ONDO, type EmailBrand } from './layout'
import { Text, Section, Row, Column, Hr } from '@react-email/components'
import { getKundeWelcomeStrings } from './KundeWelcome.i18n'

type TerminInfo = { datum: string; uhrzeit: string; adresse: string; svName: string | null }

// AAR-127: Login-Info für Magic-Link + Email/Passwort-Block
export type LoginInfo = {
  magicLink: string | null
  email: string
  password: string
}

type Props = {
  vorname: string
  fallNummer: string
  unfallDatum: string
  adresse: string
  fahrzeug: string
  versicherung: string
  svName: string | null
  accountExists: boolean
  flowToken?: string | null
  terminInfo?: TerminInfo | null
  // AAR-127: wenn gesetzt, wird Magic-Link-Button + Zugangsdaten-Block gerendert
  loginInfo?: LoginInfo | null
  // AAR-branding-rest: SV-Whitelabel (gesetzt vom Flow wenn SV verifiziert+branded)
  brand?: EmailBrand
  // i18n: Empfänger-Locale (de = Fallback). de rendert byte-identisch.
  locale: string
}

export function subject(p: Props, locale: string = 'de') {
  return getKundeWelcomeStrings(locale).subject(p.vorname)
}

export function KundeWelcomeEmail(props: Props) {
  const s = getKundeWelcomeStrings(props.locale)
  return (
    <EmailLayout preview={s.preview(props.fallNummer)} brand={props.brand} locale={props.locale}>
      <Heading brand={props.brand}>{s.heading(props.vorname)}</Heading>
      <Paragraph>
        {s.p1a}<strong>{s.p1strong}</strong>{s.p1b}
      </Paragraph>
      <Paragraph>
        {s.p2}
      </Paragraph>

      <Divider />
      <Heading brand={props.brand}>{s.headingSummary}</Heading>
      <InfoTable rows={[
        [s.labelFallnummer, props.fallNummer],
        [s.labelUnfalldatum, props.unfallDatum],
        [s.labelAdresse, props.adresse],
        [s.labelFahrzeug, props.fahrzeug],
        [s.labelVersicherung, props.versicherung],
        ...(props.svName ? [[s.labelGutachter, props.svName] as [string, string]] : []),
      ]} />

      {/* BUG-72: Termin-Info Block */}
      {props.terminInfo && (
        <>
          <Divider />
          <Section style={{ marginBottom: 16 }}>
            <Text style={{ color: ONDO, fontSize: 13, fontWeight: 700, margin: '0 0 8px', letterSpacing: '0.5px' }}>
              {s.terminTitle}
            </Text>
          </Section>
          <InfoTable rows={[
            [s.labelDatum, props.terminInfo.datum],
            [s.labelUhrzeit, s.uhrzeitValue(props.terminInfo.uhrzeit)],
            [s.labelAdresse, props.terminInfo.adresse],
            ...(props.terminInfo.svName ? [[s.labelSachverstaendiger, props.terminInfo.svName] as [string, string]] : []),
          ]} />
          <Text style={{ color: '#6b7280', fontSize: 12, lineHeight: '18px', margin: '8px 0 0', fontStyle: 'italic' }}>
            {s.terminHint}
          </Text>
        </>
      )}

      <Divider />
      {/* AAR-127: Login-Info hat Vorrang vor accountExists/flowToken — wenn der
          Account gerade frisch angelegt wurde, schicken wir Magic-Link UND
          Zugangsdaten als Fallback. */}
      {props.loginInfo ? (
        <>
          <Paragraph>
            {s.loginIntro}
          </Paragraph>

          {/* Primärer CTA: Magic-Link */}
          {props.loginInfo.magicLink && (
            <Section style={{ textAlign: 'center', padding: '24px 0' }}>
              <Button href={props.loginInfo.magicLink} brand={props.brand}>{s.loginButton}</Button>
              <Text style={{ fontSize: 12, color: '#666', margin: '8px 0 0' }}>
                {s.loginLinkHint}
              </Text>
            </Section>
          )}

          {/* Fallback: Zugangsdaten als Text */}
          <Section style={{ backgroundColor: '#f8f9fb', padding: '16px', borderRadius: '8px' }}>
            <Text style={{ fontSize: 13, color: ONDO, fontWeight: 700, margin: 0 }}>
              {s.zugangsdatenTitle}
            </Text>
            <Text style={{ fontSize: 12, color: '#666', margin: '4px 0 12px' }}>
              {s.zugangsdatenHint}
            </Text>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>{s.labelPortal}</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, margin: 0 }}>
                  <a href={`${APP_URL}/login`}>{APP_URL.replace(/^https?:\/\//, '')}/login</a>
                </Text>
              </Column>
            </Row>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>{s.labelEmail}</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, fontFamily: 'monospace', margin: 0 }}>
                  {props.loginInfo.email}
                </Text>
              </Column>
            </Row>
            <Row>
              <Column style={{ width: '90px' }}>
                <Text style={{ fontSize: 13, color: '#666', margin: 0 }}>{s.labelPasswort}</Text>
              </Column>
              <Column>
                <Text style={{ fontSize: 13, fontFamily: 'monospace', margin: 0 }}>
                  {props.loginInfo.password}
                </Text>
              </Column>
            </Row>
            <Text style={{ fontSize: 11, color: '#666', margin: '12px 0 0', fontStyle: 'italic' }}>
              {s.passwortHint}
            </Text>
          </Section>
          <Hr />
        </>
      ) : props.accountExists ? (
        <>
          <Paragraph>
            {s.accountExistsIntro}
          </Paragraph>
          <Button href={`${APP_URL}/kunde`} brand={props.brand}>{s.accountExistsButton}</Button>
        </>
      ) : (
        <>
          <Paragraph>
            {s.noAccountIntro}
          </Paragraph>
          <Button href={props.flowToken ? `${APP_URL}/flow/${props.flowToken}` : `${APP_URL}/kunde`} brand={props.brand}>
            {props.flowToken ? s.noAccountButtonCreate : s.noAccountButtonPortal}
          </Button>
        </>
      )}

      <Paragraph>
        {s.closing}
      </Paragraph>
    </EmailLayout>
  )
}
