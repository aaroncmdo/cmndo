// AAR-432: GET /api/kunde/gutachten/magic/[token]
// Löst einen Magic-Link-Token ein und streamt das Gutachten-PDF. Mehrfach-Abruf
// innerhalb 48h ist erlaubt; `accessed_at` wird nur beim ersten Abruf gesetzt
// (Audit-Zweck).

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(_req: Request, context: { params: Promise<{ token: string }> }) {
  const { token } = await context.params
  if (!token) return gonePage('Ungültiger Link.')

  const admin = createAdminClient()

  const { data: request } = await admin
    .from('kunde_gutachten_requests')
    .select('id, fall_id, expires_at, accessed_at')
    .eq('magic_link_token', token)
    .maybeSingle()

  if (!request) return gonePage('Dieser Link ist ungültig oder wurde widerrufen.')

  const expired = new Date(request.expires_at as string).getTime() < Date.now()
  if (expired) return gonePage('Dieser Link ist abgelaufen. Bitte fordern Sie das Gutachten erneut an.')

  // Gutachten-Dokument aus fall_dokumente laden (dokument_typ=gutachten)
  const { data: gutachten } = await admin
    .from('fall_dokumente')
    .select('id, storage_path, original_filename')
    .eq('fall_id', request.fall_id)
    .eq('dokument_typ', 'gutachten')
    .is('geloescht_am', null)
    .order('hochgeladen_am', { ascending: false })
    .limit(1)
    .maybeSingle()

  const storagePath = gutachten?.storage_path as string | null | undefined
  if (!storagePath) {
    return gonePage('Das Gutachten konnte nicht geladen werden. Bitte kontaktieren Sie Ihren Betreuer.')
  }
  const gutachtenUrl = admin.storage.from('fall-dokumente').getPublicUrl(storagePath).data.publicUrl

  // accessed_at idempotent setzen (nur beim ersten Abruf)
  if (!request.accessed_at) {
    try {
      await admin
        .from('kunde_gutachten_requests')
        .update({ accessed_at: new Date().toISOString() })
        .eq('id', request.id as string)
    } catch { /* non-critical */ }
  }

  // PDF per Fetch laden und weiterstreamen
  try {
    const res = await fetch(gutachtenUrl)
    if (!res.ok || !res.body) return gonePage('Gutachten-Download fehlgeschlagen.')

    const headers = new Headers()
    headers.set('Content-Type', 'application/pdf')
    const fileName = (gutachten?.original_filename as string | null) ?? 'gutachten.pdf'
    headers.set('Content-Disposition', `inline; filename="${sanitizeFilename(fileName)}"`)
    headers.set('Cache-Control', 'private, no-store')

    return new NextResponse(res.body, { status: 200, headers })
  } catch (err) {
    console.error('[AAR-432] magic-link fetch error:', err)
    return gonePage('Gutachten-Download fehlgeschlagen.')
  }
}

function gonePage(msg: string): NextResponse {
  const html = `<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Link nicht verfügbar</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; background: #f8f9fb; color: #0D1B3E; margin: 0; padding: 40px 20px; }
      .card { max-width: 420px; margin: 0 auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; padding: 28px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
      h1 { font-size: 18px; margin: 0 0 8px; }
      p { font-size: 14px; color: #4b5563; margin: 0; line-height: 1.5; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Gutachten nicht verfügbar</h1>
      <p>${escapeHtml(msg)}</p>
    </div>
  </body>
</html>`
  return new NextResponse(html, {
    status: 410,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' : '&#39;',
  )
}

function sanitizeFilename(name: string): string {
  return name.replace(/["\r\n\\]/g, '_')
}
