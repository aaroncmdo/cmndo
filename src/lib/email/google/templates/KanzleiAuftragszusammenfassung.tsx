import { EmailLayout, Heading, Paragraph, Button, InfoTable, Divider, APP_URL } from './layout'

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
  // zu den Anhängen. Kanzlei-Paket + Gutachten liegen meist als Attachment
  // dabei — hier sind Links zu allen anderen Files (Fahrzeugschein,
  // Polizeibericht, Unfallfotos, SA, Vollmacht, sonstige).
  dokumenteLinks?: KanzleiEmailDokument[]
}

export function subject(p: Props) {
  return `Neuer Fall zur Bearbeitung: ${p.fallNummer}`
}

export function KanzleiAuftragszusammenfassungEmail(props: Props) {
  const dokumente = props.dokumenteLinks ?? []
  return (
    <EmailLayout preview={`Neuer Fall ${props.fallNummer} — ${props.kundeName}`}>
      <Heading>Neuer Fall zur Bearbeitung: {props.fallNummer}</Heading>
      <Paragraph>
        Ein neuer Fall wurde nach erfolgreicher Qualitätsprüfung an Ihre Kanzlei
        übergeben. Das Kanzlei-Paket und das Gutachten sind als PDF-Anhänge
        beigefügt.
      </Paragraph>

      <InfoTable rows={[
        ['Fallnummer', props.fallNummer],
        ['Mandant', props.kundeName],
        ['Unfalldatum', props.unfallDatum],
        ['Unfallort', props.unfallOrt],
        ['Fahrzeug', props.fahrzeug],
        ['Gegn. Versicherung', props.versicherung],
        ['Schadennummer', props.schadennummer],
        ['Übergabe am', props.uebergabeDatum],
      ]} />

      <Paragraph>{props.svBerichtHinweis}</Paragraph>

      <Button href={`${APP_URL}/kanzlei/fall/${props.fallId}`}>
        Vollständige Fallakte im Kanzlei-Portal öffnen
      </Button>

      {dokumente.length > 0 && (
        <>
          <Divider />
          <Paragraph>
            <strong>Weitere Dokumente zum Fall ({dokumente.length})</strong> —
            direkte Download-Links:
          </Paragraph>
          <ul style={{ paddingLeft: 20, margin: 0, fontSize: 14, lineHeight: 1.7 }}>
            {dokumente.map((d) => (
              <li key={d.id}>
                <a href={d.url} style={{ color: '#4573A2' }}>
                  {d.label}
                </a>
                {d.meta ? (
                  <span style={{ color: '#6b7280', fontSize: 12 }}> — {d.meta}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <Divider />
      <Paragraph>
        Die digitale Fallakte enthält zusätzlich Timeline, Chat und laufende
        Status-Updates. Falls Rückfragen bestehen, bitte einen kurzen
        Rückruf-Termin über das Kanzlei-Portal buchen
        (<a href={`${APP_URL}/kanzlei/termin`} style={{ color: '#4573A2' }}>
          Termin buchen
        </a>).
      </Paragraph>
    </EmailLayout>
  )
}
