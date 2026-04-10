import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const BACKUP_TABLES = [
  'profiles',
  'sachverstaendige',
  'gutachter_organisationen',
  'faelle',
  'fall_dokumente',
  'vertraege_unterzeichnet',
  'rechnungen',
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
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

    // Send error notification via Resend if configured
    if (process.env.RESEND_API_KEY) {
      try {
        const { Resend } = await import('resend')
        const resend = new Resend(process.env.RESEND_API_KEY)
        await resend.emails.send({
          from: process.env.RESEND_FROM || 'Claimondo <noreply@claimondo.de>',
          to: 'aaron@claimondo.de',
          subject: `[ALERT] DB-Backup fehlgeschlagen - ${dateStr}`,
          text: `Das taegliche DB-Backup ist fehlgeschlagen.\n\nFehler: ${message}\nZeit: ${now.toISOString()}\n\nBitte pruefen: Supabase Dashboard > Storage > db-backups`,
        })
      } catch (mailErr) {
        console.error('Failed to send backup error notification:', mailErr)
      }
    }

    return NextResponse.json({ status: 'error', error: message }, { status: 500 })
  }
}
