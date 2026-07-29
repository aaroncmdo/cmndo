// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.

// Werkstatt-Onboarding-Aktivierungs-Drip — Mail 3: Vorstellung des zugeordneten
// Sachverstaendigen (SV) in der Region der Werkstatt.
//
// Barrel-Anpassung ggue. Brief-Entwurf (Spec §12/§B8): EmailShell nutzt `preview`
// (nicht `preheader`); Hero nimmt `headline` als Prop (nicht children) + verlangt
// `logoUrl` (hier null = Claimondo-Textlogo); Footer nimmt nur `onDark` (kein
// ansprechpartner/tel) -- der Kontakt-Hinweis (Nicolas + tel:-Link) sitzt daher
// als eigener Paragraph vor dem Footer.

import { EmailShell, Hero, Card, Paragraph, Button, BeraterCard, Footer } from '../../../components'
import { email } from '../../../tokens'
import type { WerkstattMergeVars } from './types'
import type { CopyFor } from './copy-schemas'

type Props = { copy: CopyFor<'sv_vorstellung'>; merge: WerkstattMergeVars }

export function subject(copy: CopyFor<'sv_vorstellung'>, merge: WerkstattMergeVars): string {
  return merge.sv ? `Dein Gutachter in ${merge.sv.region}: ${merge.sv.name}` : 'Dein Gutachter in deiner Region'
}

export function SvVorstellungEmail({ copy, merge }: Props) {
  const region = merge.sv?.region ?? 'deiner Region'
  return (
    <EmailShell preview={subject(copy, merge)}>
      <Hero logoUrl={null} headline={copy.headline.replace('[Region]', region)} />
      <Card>
        <Paragraph>Hallo {merge.werkstattName},</Paragraph>
        {merge.sv && (
          <BeraterCard
            name={merge.sv.name}
            photoUrl={merge.sv.photoUrl ?? null}
            contact={merge.sv.contact ?? ''}
            label={`Dein Gutachter in ${merge.sv.region}`}
          />
        )}
        {copy.absaetze.map((a, i) => (
          <Paragraph key={i}>{a.replace('[Gutachter-Name]', merge.sv?.name ?? '')}</Paragraph>
        ))}
        <Button href={merge.portalLink}>{copy.cta_label}</Button>
        <Paragraph>
          Fragen? {merge.ansprechpartner} hilft dir gerne weiter unter{' '}
          <a href={`tel:${merge.tel}`} style={{ color: email.color.ondo }}>{merge.tel}</a>.
        </Paragraph>
      </Card>
      <Footer onDark={false} />
    </EmailShell>
  )
}
