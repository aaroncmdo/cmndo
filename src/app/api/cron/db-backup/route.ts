import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'

// 2026-06-20: Tabellenliste auf den kanonischen Satz korrigiert (Notification/Cron-Audit).
// Vorher kaputt: 'gutachter_organisationen' + 'rechnungen' existieren NICHT (heissen
// 'organisationen' / 'abrechnungen') -> jeder Lauf loggte Fehler + sicherte leer; 'faelle'
// ist deprecated (CMM-49-Drop) und die SSoT-Tabellen claims/claim_parties/leads/vehicles
// fehlten komplett. (db-backup ist error-tolerant pro Tabelle; echtes DR-Netz = Supabase-PITR,
// dies ist ein ergaenzender JSON-Export der Kern-Tabellen.)
const BACKUP_TABLES = [
  // Kern-Entitaeten (CMM-49 SSoT)
  'claims',
  'claim_parties',
  'leads',
  'vehicles',
  'gutachter_termine',
  // Akteure
  'profiles',
  'sachverstaendige',
  'organisationen',
  // Billing + Dokumente
  'abrechnungen',
  'fall_dokumente',
  'vertraege_unterzeichnet',
  'vertragsvorlagen',
] as const

const BUCKET = 'db-backups'
const RETENTION_DAYS = 30

/**
 * Cron-Route: DB-Backup (taeglich 03:00 UTC)
 * JSON-Export der wichtigsten Tabellen -> Supabase Storage.
 * Loescht Backups aelter als 30 Tage.
 */
export async function GET(request: Request) {
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const dateStr = now.toISOString().split('T')[0] // YYYY-MM-DD
  const filePath = `daily/${dateStr}.json`

  try {
    // 1) Export tables
    const backup: Record<string, { count: number; rows: unknown[] }> = {}
    let totalRows = 0

    for (const table of BACKUP_TABLES) {
      const { data, error } = await supabase.from(table).select('*')
      if (error) {
        console.error(`Backup error for table ${table}:`, error.message)
        backup[table] = { count: 0, rows: [] }
        continue
      }
      backup[table] = { count: data.length, rows: data }
      totalRows += data.length
    }

    // 2) Upload to Storage
    const jsonBlob = new Blob(
      [JSON.stringify({ created_at: now.toISOString(), tables: backup }, null, 2)],
      { type: 'application/json' },
    )

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(filePath, jsonBlob, { upsert: true })

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`)
    }

    // 3) Cleanup: delete backups older than 30 days
    const { data: existingFiles } = await supabase.storage.from(BUCKET).list('daily')

    if (existingFiles) {
      const cutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
      const oldFiles = existingFiles.filter((f) => {
        const dateMatch = f.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
        if (!dateMatch) return false
        return new Date(dateMatch[1]) < cutoff
      })

      if (oldFiles.length > 0) {
        const paths = oldFiles.map((f) => `daily/${f.name}`)
        await supabase.storage.from(BUCKET).remove(paths)
      }
    }

    return NextResponse.json({
      status: 'ok',
      tabellen_count: BACKUP_TABLES.length,
      total_rows: totalRows,
      file_path: filePath,
      cleaned_up: existingFiles
        ? existingFiles.filter((f) => {
            const m = f.name.match(/^(\d{4}-\d{2}-\d{2})\.json$/)
            return m && new Date(m[1]) < new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000)
          }).length
        : 0,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'

    // Send error notification via central sendCommunication
    try {
      const { render } = await import('@react-email/render')
      const { AdminBackupFehlgeschlagenEmail, subject: backupSubject } = await import('@/lib/email/google/templates/AdminBackupFehlgeschlagen')
      const { sendCommunication } = await import('@/lib/communications/send')
      const backupProps = { datum: dateStr, fehler: message }
      const html = await render(AdminBackupFehlgeschlagenEmail(backupProps))
      await sendCommunication('admin_backup_failed', {
        email: process.env.ADMIN_ALERT_EMAIL || 'aaron@claimondo.de',
        subject: backupSubject(backupProps),
        html,
      })
    } catch (mailErr) {
      console.error('Failed to send backup error notification:', mailErr)
    }

    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
