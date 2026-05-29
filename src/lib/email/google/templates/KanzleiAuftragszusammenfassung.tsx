// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Button, DocumentList, Footer } from '../../components'
import { Link } from '@react-email/components'
import { email } from '../../tokens'
import { APP_URL } from './layout'

export type KanzleiEmailDokument = {
  id: string
  label: string
  /** Public-URL (Supabase-Storage) zum Dokument. */
  url: string
  /** Nur-Darstellung (z. B. „PDF · 2.3 MB"). Optional. */
  meta?: string
}

type Props = {
  fallNummer: string
  kundeName: string
  unfallDatum: string
  unfallOrt: string
  fahrzeug: string
  versicherung: string
  schadennummer: string
  svBerichtHinweis: string
  uebergabeDatum: string
  fallId: string
  // AAR-kanzlei-portal PR 5: Download-Liste aller Fall-Dokumente zusätzlich
  // zu den Anhängen.
  dokumenteLinks?: KanzleiEmailDokument[]
}

export function subject(p: Props) {
  return `Neuer Fall zur Bearbeitung: ${p.fallNummer}`
}

export function KanzleiAuftragszusammenfassungEmail(props: Props) {
  const dokumente = props.dokumenteLinks ?? []
  return (
    <EmailShell preview={`Neuer Fall ${props.fallNummer} — ${props.kundeName}`}>
      <MailHeader />
      <Card>
        <Heading>Neuer Fall zur Bearbeitung: {props.fallNummer}</Heading>
        <Paragraph>
          Ein neuer Fall wurde nach erfolgreicher Qualitätsprüfung an Ihre Kanzlei
          übergeben. Das Kanzlei-Paket und das Gutachten sind als PDF-Anhänge
          beigefügt.
        </Paragraph>

        <InfoRow label="Fallnummer" value={props.fallNummer} />
        <InfoRow label="Mandant" value={props.kundeName} />
        <InfoRow label="Unfalldatum" value={props.unfallDatum} />
        <InfoRow label="Unfallort" value={props.unfallOrt} />
        <InfoRow label="Fahrzeug" value={props.fahrzeug} />
        <InfoRow label="Gegn. Versicherung" value={props.versicherung} />
        <InfoRow label="Schadennummer" value={props.schadennummer} />
        <InfoRow label="Übergabe am" value={props.uebergabeDatum} />

        <Paragraph>{props.svBerichtHinweis}</Paragraph>

        <Button href={`${APP_URL}/kanzlei/fall/${props.fallId}`}>
          Vollständige Fallakte im Kanzlei-Portal öffnen
        </Button>

        {dokumente.length > 0 && (
          <>
            <Paragraph>
              <strong>Weitere Dokumente zum Fall ({dokumente.length})</strong> — direkte Download-Links:
            </Paragraph>
            <DocumentList items={dokumente.map((d) => ({ label: d.label, url: d.url, meta: d.meta }))} />
          </>
        )}

        <Paragraph>
          Die digitale Fallakte enthält zusätzlich Timeline, Chat und laufende
          Status-Updates. Falls Rückfragen bestehen, bitte einen kurzen
          Rückruf-Termin über das Kanzlei-Portal buchen
          (<Link href={`${APP_URL}/kanzlei/termin`} style={{ color: email.color.ondo }}>Termin buchen</Link>).
        </Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
