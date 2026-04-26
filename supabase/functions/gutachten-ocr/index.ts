// AAR-838: Gutachten-OCR Edge Function (Skeleton)
//
// SKELETON-STAND: setzt ocr_status='failed' mit reason='engine_not_implemented'.
// Echte OCR-Pipeline (Claude Vision + Anbieter-Adapter + Field-Mapping +
// Plausi-Checks) wird in AAR-846 implementiert.
//
// Trigger:
//   - Auto nach Upload via uploadGutachtenPdf-Action
//   - Manueller Retry via retryGutachtenOcr-Action
//   - Cron-Recovery alle 5 Min für stuck pending-Rows
//
// Body-Schema:
//   { gutachten_id: string, run_nummer: number,
//     triggered_by: 'auto_after_upload'|'manual_kb_retry'|'manual_admin_retry'|'cron_recovery',
//     engine_hint?: 'claude_vision'|'google_vision' }

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

interface RequestBody {
  gutachten_id:    string
  run_nummer:      number
  triggered_by:    'auto_after_upload' | 'manual_kb_retry' | 'manual_admin_retry' | 'cron_recovery'
  engine_hint?:    'claude_vision' | 'google_vision'
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'POST only' }), { status: 405 })
  }

  const body = (await req.json().catch(() => null)) as RequestBody | null
  if (!body?.gutachten_id || !body.run_nummer || !body.triggered_by) {
    return new Response(JSON.stringify({ ok: false, error: 'Missing required fields' }), { status: 400 })
  }

  // Service-Role-Client (Edge Function läuft mit eigenen Credentials)
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  )

  // 1) Idempotenz-Check: lock auf gutachten-Row
  const { data: gutachten, error: fetchErr } = await supabase
    .from('gutachten')
    .select('id, claim_id, ocr_status, ocr_started_at, bericht_pdf_url')
    .eq('id', body.gutachten_id)
    .maybeSingle()

  if (fetchErr || !gutachten) {
    return new Response(JSON.stringify({ ok: false, error: 'Gutachten nicht gefunden' }), { status: 404 })
  }

  // Wenn schon ein anderer Worker läuft (started_at < 10 Min), abbrechen
  if (gutachten.ocr_status === 'running'
      && gutachten.ocr_started_at
      && new Date(gutachten.ocr_started_at as string) > new Date(Date.now() - 10 * 60_000)) {
    return new Response(JSON.stringify({
      ok: false,
      error: 'Anderer Worker läuft bereits',
    }), { status: 409 })
  }

  // 2) ocr_status auf running + ocr_runs-Row anlegen
  const startedAt = new Date().toISOString()
  await supabase
    .from('gutachten')
    .update({
      ocr_status:     'running',
      ocr_started_at: startedAt,
    })
    .eq('id', body.gutachten_id)

  const { data: runRow } = await supabase
    .from('ocr_runs')
    .insert({
      gutachten_id:   body.gutachten_id,
      run_nummer:     body.run_nummer,
      engine:         body.engine_hint ?? 'claude_vision',
      engine_version: 'skeleton-0.0',
      triggered_by:   body.triggered_by,
      status:         'running',
      started_at:     startedAt,
    })
    .select('id')
    .single()

  // ─────────────────────────────────────────────────────────────────────────
  // SKELETON: echte OCR-Engine ist Out-of-Scope (AAR-846).
  // Hier setzen wir ocr_status='failed' mit klarem reason damit der
  // Rest der Pipeline (Cron-Recovery, KB-Notification, Re-Run) testbar ist.
  // ─────────────────────────────────────────────────────────────────────────

  const finishedAt = new Date().toISOString()
  const errorPayload = {
    code:      'engine_not_implemented',
    message:   'Echte OCR-Pipeline kommt mit AAR-846 (Claude Vision + Anbieter-Adapter)',
    retryable: false,
  }

  await supabase
    .from('ocr_runs')
    .update({
      status:                'failed',
      finished_at:           finishedAt,
      error_jsonb:           errorPayload,
      validation_passed:     false,
    })
    .eq('id', runRow?.id as string)

  await supabase
    .from('gutachten')
    .update({
      ocr_status:      'failed',
      ocr_engine:      body.engine_hint ?? 'claude_vision',
      ocr_finished_at: finishedAt,
      ocr_error_jsonb: errorPayload,
      ocr_run_id:      runRow?.id ?? null,
    })
    .eq('id', body.gutachten_id)

  // 3) Notification an KB
  const { data: fall } = await supabase
    .from('faelle')
    .select('id')
    .eq('claim_id', gutachten.claim_id as string)
    .maybeSingle()

  if (fall?.id) {
    await supabase.from('notification_events').insert({
      event_type: 'gutachten.ocr_failed',
      payload: {
        fallId:       fall.id,
        gutachtenId:  body.gutachten_id,
        runNummer:    body.run_nummer,
        reason:       errorPayload.code,
      },
      fall_id: fall.id,
      status:  'pending',
    })
  }

  return new Response(JSON.stringify({
    ok:        true,
    skeleton:  true,
    note:      'Skeleton-Run — echte OCR via AAR-846',
    run_id:    runRow?.id,
  }), { status: 200, headers: { 'content-type': 'application/json' } })
})
