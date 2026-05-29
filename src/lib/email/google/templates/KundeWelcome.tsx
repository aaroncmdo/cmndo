// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
//
// P2 (2026-05-29): Tier-1-Flagship auf das neue Primitive-Set (src/lib/email/components).
// Funktionaler Kern UNVERÄNDERT: Magic-Link + Zugangsdaten, Termin-Block, 3 Account-
// Zustände, i18n, SV-Whitelabel, Idempotenz (Caller). Optik = Hero + Fall-Card + Berater.
import { APP_URL, type EmailBrand } from './layout'
import { Text } from '@react-email/components'
import {
  EmailShell, Hero, VehicleCard, Card, StatGrid, StatusPill, BeraterCard,
  Button, Note, Trustbar, Footer, InfoRow, Paragraph,
} from '../../components'
import { email } from '../../tokens'
import { getKundeWelcomeStrings } from './KundeWelcome.i18n'

type TerminInfo = { datum: string; uhrzeit: string; adresse: string; svName: string | null }

// AAR-127: Login-Info für Magic-Link + Email/Passwort-Block
export type LoginInfo = {
  magicLink: string | null
  email: string
  password: string
}

// P2: phasenabhängiger Ansprechpartner (Resolver: src/lib/email/google/kunde-berater.ts)
export type KundeBeraterInfo = { name: string; photoUrl: string | null; contact: string }

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
  // P2: imagin-Render des Kundenfahrzeugs (null = ausblenden, z.B. bis imagin-API live)
  fahrzeugBildUrl?: string | null
  // P2: gebackenes Hero-Hintergrundbild (P1b); fehlt → flacher Navy-Hero
  heroBildUrl?: string | null
  // P2: pre-Termin Dispatcher / post-Termin Kundenbetreuer (null = Block ausgelassen)
  berater?: KundeBeraterInfo | null
}

export function subject(p: Props, locale: string = 'de') {
  return getKundeWelcomeStrings(locale).subject(p.vorname)
}

export function KundeWelcomeEmail(props: Props) {
  const s = getKundeWelcomeStrings(props.locale)
  const ctaBg = props.brand?.primary || email.color.navy
  // Claimondo-Default = Text-Logo-Chip (SVG-Logos werden in vielen Mail-Clients geblockt);
  // gebrandeter SV liefert i.d.R. ein PNG via brand.logoUrl.
  const logoUrl = props.brand?.logoUrl ?? null

  const statItems = [
    { label: s.labelFallnummer, value: props.fallNummer },
    { label: s.labelUnfalldatum, value: props.unfallDatum },
    { label: s.labelFahrzeug, value: props.fahrzeug },
    { label: s.labelVersicherung, value: props.versicherung },
    { label: s.labelAdresse, value: props.adresse && props.adresse !== '—' ? props.adresse : null },
    ...(props.svName ? [{ label: s.labelGutachter, value: props.svName }] : []),
  ]

  return (
    <EmailShell preview={s.preview(props.fallNummer)} dark backgroundUrl={props.heroBildUrl ?? undefined}>
      <Hero logoUrl={logoUrl} logoText={props.brand?.firmenname ?? undefined} headline={s.heading(props.vorname)} subline={s.heroSubline}>
        {props.fahrzeugBildUrl
          ? <VehicleCard imageUrl={props.fahrzeugBildUrl} label={s.labelFahrzeug} value={props.fahrzeug} />
          : null}
      </Hero>

      <Card>
        {/* Was passiert jetzt — Reassurance (bisheriger p2-Text) */}
        <Paragraph>{s.p2}</Paragraph>

        {/* Fall-Überblick + Status-Pill */}
        <table width="100%" style={{ borderCollapse: 'collapse', margin: `${email.space(2)} 0 ${email.space(3)}` }}>
          <tbody><tr>
            <td style={{ ...email.font.label, color: email.color.navy, verticalAlign: 'middle' }}>{s.fallUeberblick}</td>
            <td style={{ textAlign: 'right' as const, verticalAlign: 'middle' }}><StatusPill>{s.statusLabel}</StatusPill></td>
          </tr></tbody>
        </table>
        <StatGrid items={statItems} />

        {/* Ansprechpartner (datengetrieben: pre-Termin Dispatcher / post-Termin Kundenbetreuer) */}
        {props.berater
          ? <BeraterCard name={props.berater.name} photoUrl={props.berater.photoUrl} contact={props.berater.contact} label={s.beraterLabel} />
          : null}

        {/* BUG-72: Termin-Block */}
        {props.terminInfo ? (
          <>
            <Text style={{ color: email.color.ondo, fontSize: 13, fontWeight: 700, margin: `${email.space(4)} 0 ${email.space(2)}`, letterSpacing: '0.5px' }}>
              {s.terminTitle}
            </Text>
            <InfoRow label={s.labelDatum} value={props.terminInfo.datum} />
            <InfoRow label={s.labelUhrzeit} value={s.uhrzeitValue(props.terminInfo.uhrzeit)} />
            <InfoRow label={s.labelAdresse} value={props.terminInfo.adresse} />
            {props.terminInfo.svName ? <InfoRow label={s.labelSachverstaendiger} value={props.terminInfo.svName} /> : null}
            <Note>{s.terminHint}</Note>
          </>
        ) : null}

        {/* AAR-127: Login-Info hat Vorrang — Magic-Link UND Zugangsdaten als Fallback */}
        {props.loginInfo ? (
          <>
            <Paragraph>{s.loginIntro}</Paragraph>
            {props.loginInfo.magicLink ? (
              <>
                <Button href={props.loginInfo.magicLink} bg={ctaBg}>{s.loginButton}</Button>
                <Note>{s.loginLinkHint}</Note>
              </>
            ) : null}
            {/* Fallback: Zugangsdaten als Text */}
            <div style={{ backgroundColor: email.color.surface, borderRadius: email.radius.md, padding: `${email.space(3)} ${email.space(4)}`, margin: `${email.space(3)} 0` }}>
              <Text style={{ fontSize: 13, color: email.color.ondo, fontWeight: 700, margin: 0 }}>{s.zugangsdatenTitle}</Text>
              <Text style={{ fontSize: 12, color: email.color.textMuted, margin: `${email.space(1)} 0 ${email.space(3)}` }}>{s.zugangsdatenHint}</Text>
              <InfoRow label={s.labelPortal} value={`${APP_URL.replace(/^https?:\/\//, '')}/login`} />
              <InfoRow label={s.labelEmail} value={<span style={{ fontFamily: 'monospace' }}>{props.loginInfo.email}</span>} />
              <InfoRow label={s.labelPasswort} value={<span style={{ fontFamily: 'monospace' }}>{props.loginInfo.password}</span>} />
              <Note>{s.passwortHint}</Note>
            </div>
          </>
        ) : props.accountExists ? (
          <>
            <Paragraph>{s.accountExistsIntro}</Paragraph>
            <Button href={`${APP_URL}/kunde`} bg={ctaBg}>{s.accountExistsButton}</Button>
          </>
        ) : (
          <>
            <Paragraph>{s.noAccountIntro}</Paragraph>
            <Button href={props.flowToken ? `${APP_URL}/flow/${props.flowToken}` : `${APP_URL}/kunde`} bg={ctaBg}>
              {props.flowToken ? s.noAccountButtonCreate : s.noAccountButtonPortal}
            </Button>
          </>
        )}

        <Note>{s.closing}</Note>
        <Trustbar items={s.trustItems} />
      </Card>

      <Footer onDark />
    </EmailShell>
  )
}
