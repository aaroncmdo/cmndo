import { EmailLayout, Heading, Paragraph, InfoTable, Divider } from './layout'

// Admin-Alert: Taeglich DB-Backup fehlgeschlagen

type Props = {
  datum: string    // YYYY-MM-DD
  fehler: string
}

export function subject(p: Props) {
  return `[ALERT] DB-Backup fehlgeschlagen - ${p.datum}`
}

export function AdminBackupFehlgeschlagenEmail(props: Props) {
  return (
    <EmailLayout preview={`DB-Backup fehlgeschlagen: ${props.datum}`}>
      <Heading>DB-Backup fehlgeschlagen</Heading>

      <Paragraph>
        Das tägliche DB-Backup ist fehlgeschlagen.
      </Paragraph>

      <InfoTable rows={[
        ['Datum', props.datum],
        ['Fehler', props.fehler],
      ]} />

      <Divider />

      <Paragraph>
        Bitte prüfen: Supabase Dashboard &gt; Storage &gt; db-backups
      </Paragraph>

      <Paragraph>Claimondo Alert-System</Paragraph>
    </EmailLayout>
  )
}
