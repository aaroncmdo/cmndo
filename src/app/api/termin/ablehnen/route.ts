'use server'

import { createServiceClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

/**
 * KFZ-118: Gutachter lehnt Termin ab (via Link in WhatsApp oder Portal).
 * GET /api/termin/ablehnen?token=<ablehnen_token>&grund=<optional>
 */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const grund = req.nextUrl.searchParams.get('grund') || 'Über Ablehnen-Link'

  if (!token) {
    return NextResponse.json({ error: 'Token fehlt' }, { status: 400 })
  }

  const svc = createServiceClient()

  // 1. Termin per Token finden
  const { data: termin } = await svc
    .from('gutachter_termine')
    .select('id, sv_id, fall_id, start_zeit, status')
    .eq('ablehnen_token', token)
    .maybeSingle()

  if (!termin) {
    return new NextResponse(htmlPage('Termin nicht gefunden', 'Der Ablehnen-Link ist ungültig oder abgelaufen.', false), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  if (termin.status === 'abgelehnt') {
    return new NextResponse(htmlPage('Bereits abgelehnt', 'Dieser Termin wurde bereits abgelehnt. Claimondo wird einen neuen Gutachter zuweisen.', true), {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  }

  // 2. Termin ablehnen
  await svc.from('gutachter_termine').update({
    status: 'abgelehnt',
    abgelehnt_am: new Date().toISOString(),
    abgelehnt_grund: grund,
  }).eq('id', termin.id)

  // KFZ-136: Reminder stornieren
  try { const { cancelRemindersForTermin } = await import('@/lib/reminders/generate'); await cancelRemindersForTermin(termin.id) } catch (err) { console.error('[KFZ-136] Reminder-Cancel:', err) }

  // 3. Fall updaten: sv_id NULL, gutachter_termin_status = abgelehnt
  if (termin.fall_id) {
    await svc.from('faelle').update({
      sv_id: null,
      gutachter_termin_status: 'abgelehnt',
      updated_at: new Date().toISOString(),
    }).eq('id', termin.fall_id)

    // Timeline-Eintrag
    await svc.from('timeline').insert({
      fall_id: termin.fall_id,
      typ: 'system',
      titel: 'Gutachter hat Termin abgelehnt',
      beschreibung: `Grund: ${grund}. Neuer Gutachter wird gesucht.`,
    })

    // WhatsApp an Admin
    try {
      const { data: svData } = await svc.from('sachverstaendige')
        .select('profiles(vorname, nachname)')
        .eq('id', termin.sv_id)
        .single()
      const svP = (Array.isArray(svData?.profiles) ? svData?.profiles[0] : svData?.profiles) as { vorname: string | null; nachname: string | null } | null
      const svName = svP ? `${svP.vorname ?? ''} ${svP.nachname ?? ''}`.trim() : 'Unbekannt'

      const { data: fallData } = await svc.from('faelle').select('fall_nummer, lead_id').eq('id', termin.fall_id).single()
      const terminDatum = termin.start_zeit ? new Date(termin.start_zeit).toLocaleDateString('de-DE') : '?'

      const { sendManualWhatsApp } = await import('@/lib/whatsapp')
      const { data: admins } = await svc.from('profiles').select('telefon').eq('rolle', 'admin')
      for (const a of admins ?? []) {
        if (a.telefon) {
          await sendManualWhatsApp(a.telefon,
            `⚠️ Gutachter ${svName} hat den Termin am ${terminDatum} für ${fallData?.fall_nummer ?? 'Fall'} ABGELEHNT. Bitte neuen Gutachter zuweisen.`,
            termin.fall_id,
          )
        }
      }
    } catch { /* non-critical */ }

    // Task erstellen: Neuen Gutachter zuweisen
    try {
      const { data: fallData } = await svc.from('faelle').select('fall_nummer, kundenbetreuer_id').eq('id', termin.fall_id).single()
      await svc.from('tasks').insert({
        fall_id: termin.fall_id,
        titel: `Neuen Gutachter zuweisen für ${fallData?.fall_nummer ?? 'Fall'}`,
        typ: 'dispatch',
        status: 'offen',
        prioritaet: 'hoch',
        faellig_am: new Date().toISOString(),
        zugewiesen_an: fallData?.kundenbetreuer_id ?? null,
      })
    } catch { /* non-critical */ }
  }

  return new NextResponse(htmlPage('Termin abgelehnt', 'Der Termin wurde erfolgreich abgelehnt. Claimondo wird einen neuen Gutachter zuweisen.', true), {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function htmlPage(title: string, message: string, success: boolean) {
  const color = success ? '#22c55e' : '#ef4444'
  return `<!DOCTYPE html>
<html lang="de">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title} — Claimondo</title>
<style>body{font-family:-apple-system,system-ui,sans-serif;display:flex;justify-content:center;align-items:center;min-height:100vh;margin:0;background:#f8f9fb}
.card{max-width:400px;background:#fff;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
.icon{width:48px;height:48px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;font-size:24px}
h1{font-size:20px;color:#111;margin:0 0 8px}p{font-size:14px;color:#666;margin:0}</style></head>
<body><div class="card"><div class="icon">${success ? '✓' : '✗'}</div><h1>${title}</h1><p>${message}</p></div></body></html>`
}
