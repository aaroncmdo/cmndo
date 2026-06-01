// Token-Audit-Skip: Email-Template via react-email/Resend — rendert ohne Tailwind/CSS-Vars.
//   Siehe src/lib/external-brand-colors.ts und AGENTS.md §branding-rules.
import { EmailShell, MailHeader, Card, Heading, Paragraph, InfoRow, Footer } from '../../components'

// Admin-Alert: Taeglich DB-Backup fehlgeschlagen. P3 Tier-3 (System): minimal, immer Claimondo.

type Props = {
  datum: string    // YYYY-MM-DD
  fehler: string
}

export function subject(p: Props) {
  return `[ALERT] DB-Backup fehlgeschlagen - ${p.datum}`
}

export function AdminBackupFehlgeschlagenEmail(props: Props) {
  return (
    <EmailShell preview={`DB-Backup fehlgeschlagen: ${props.datum}`}>
      <MailHeader />
      <Card>
        <Heading>DB-Backup fehlgeschlagen</Heading>
        <Paragraph>Das tägliche DB-Backup ist fehlgeschlagen.</Paragraph>

        <InfoRow label="Datum" value={props.datum} />
        <InfoRow label="Fehler" value={props.fehler} />

        <Paragraph>Bitte prüfen: Supabase Dashboard &gt; Storage &gt; db-backups</Paragraph>
        <Paragraph>Claimondo Alert-System</Paragraph>
      </Card>
      <Footer />
    </EmailShell>
  )
}
