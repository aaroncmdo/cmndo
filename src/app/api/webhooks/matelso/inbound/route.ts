// matelso Inbound-Webhook — Call-Events + Auto-Lead fuer die kfzgutachter Ads-LP.
// Ersetzt Aircall als Call-Tracker fuer die LP-Nummer; aircall_calls bleibt unberuehrt.
// Spec: docs/superpowers/specs/2026-05-22-matelso-call-tracking-webhook-design.md
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'node:crypto'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
// C2/§9-#5 (Ein Intake): der Anrufer-Lead laeuft ueber `createCase` statt roh ueber
// `createLead` — dadurch bekommt er einen garantierten FlowLink (siehe unten).
import { createCase } from '@/lib/intake/create-case'
import { createNotification } from '@/lib/notifications'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { MatelsoEventSchema } from '@/lib/schemas/matelso-event'
import {
  normalizeMatelsoStatus,
  buildDedupKey,
  pickNotificationLink,
  buildCallNotificationText,
} from '@/lib/matelso/process-call'

export const dynamic = 'force-dynamic'

function secretValid(provided: string | null, expected: string): boolean {
  if (!provided) return false
  const a = Buffer.from(provided)
  const b = Buffer.from(expected)
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  // 1. Auth — ?secret= gegen MATELSO_WEBHOOK_SECRET (timing-safe).
  const secret = process.env.MATELSO_WEBHOOK_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 })
  }
  if (!secretValid(req.nextUrl.searchParams.get('secret'), secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // 2. Parse + Validate.
  const body = await req.text()
  let rawJson: unknown
  try {
    rawJson = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }
  const parsed = MatelsoEventSchema.safeParse(rawJson)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    return NextResponse.json(
      { error: 'Invalid matelso payload', detail: `${first?.path.join('.')}: ${first?.message}` },
      { status: 400 },
    )
  }
  const event = parsed.data

  const admin = createAdminClient()
  const fromNumber = (event.anrufer_nummer ?? '').trim()
  const toNumber = (event.angerufene_nummer ?? '').trim()
  const status = normalizeMatelsoStatus(event.anruf_status)
  const duration = event.dauer_sekunden != null ? Number(event.dauer_sekunden) : null
  const quelle = event.quelle ?? null
  const parsedTime = event.zeitpunkt ? new Date(event.zeitpunkt) : null
  const startedAtIso =
    parsedTime && !Number.isNaN(parsedTime.getTime()) ? parsedTime.toISOString() : new Date().toISOString()
  const externalCallId = buildDedupKey({ callId: event.call_id, from: fromNumber, zeitpunkt: event.zeitpunkt })

  // 3. Idempotenz — bekannter Call? -> nur aktualisieren, kein 2. Lead/Notification.
  // CMM-49: matelso_calls ist claim-gekeyt — claim_id statt fall_id lesen.
  const { data: existing } = await admin
    .from('matelso_calls')
    .select('id, lead_id, claim_id')
    .eq('external_call_id', externalCallId)
    .maybeSingle()

  if (existing) {
    const { error: updateError } = await admin
      .from('matelso_calls')
      .update({
        status,
        status_raw: event.anruf_status ?? null,
        duration,
        quelle,
        // Zod-passthrough-Typ ist nicht direkt jsonb-zuweisbar; bewusster Double-Cast.
        raw_payload: event as unknown as Record<string, unknown>,
        updated_at: new Date().toISOString(),
      })
      .eq('external_call_id', externalCallId)
    if (updateError) {
      return NextResponse.json({ error: 'DB update failed', detail: updateError.message }, { status: 500 })
    }
    // CMM-49: Webhook-Ack reportet jetzt claim_id (matelso konsumiert das Feld nicht zurück).
    return NextResponse.json({ ok: true, deduped: true, lead_id: existing.lead_id, claim_id: existing.claim_id })
  }

  // 4. Match auf bestehenden Lead/Fall.
  let leadId: string | null = null
  let fallId: string | null = null
  // CMM-49: matelso_calls ist claim-gekeyt; interim faelle.claim_id-Lookup (P4-TODO: claimId aus matchInboundToFall threaden).
  let claimId: string | null = null
  let isNewLead = false

  if (fromNumber) {
    const match = await matchInboundToFall(admin, fromNumber)
    leadId = match.leadId
    fallId = match.fallId
    if (fallId) {
      claimId = await resolveClaimId(admin, fallId)
    }

    // 5. Auto-Lead nur wenn weder Lead noch Fall gematcht (wie Aircall).
    if (!leadId && !fallId) {
      const nowBerlin = new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin' })
      // C2/§9-#5: ueber `createCase` statt roh ueber `createLead` — identisch zum bereits
      // gehobenen Aircall-Webhook (C2b D-4b). Der Gewinn ist der garantierte FlowLink:
      // vorher entstand hier ein Anrufer-Lead OHNE jeden Kunde-Kanal; wer nicht
      // zurueckgerufen wurde, hatte keinen Weg zurueck in den Vorgang.
      //
      // mode='lead-first': ein Anruf ist noch kein Fall — die Konversion passiert spaeter
      // ueber /flow. KEIN dedup-Key: der generische ist ohne Kennzeichen unbrauchbar
      // (`dedupKeyIsUsable`), und der praezisere Telefon-Abgleich lief oben schon ueber
      // `matchInboundToFall` — genau diese Begruendung steht so auch im Aircall-Pfad.
      const created = await createCase(admin, {
        mode: 'lead-first',
        // AAR-956 17.07. (Befund 4): keine 'Unbekannt'/'Anrufer'-Platzhalter — NULL laesst
        // Gruss-Fallbacks (#4469) und Staff-Render-Fallbacks korrekt greifen.
        base: { source_channel: 'matelso-call', status: 'neu', telefon: fromNumber },
        extra: {
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch matelso-Anruf am ${nowBerlin} · Quelle: ${quelle ?? 'unbekannt'} · Status: ${status} · Dauer: ${duration ?? 0}s`,
        },
      })
      if (!created.ok) console.error('[matelso] createCase failed:', created.error)
      leadId = created.ok ? created.leadId : null
      isNewLead = created.ok // bewusst praeziser als der aircall-Pfad: nur true bei echtem Erfolg
    }
  }

  // 6. Notification an Dispatch+Admin bei JEDEM Anruf (fire-and-forget).
  try {
    const { data: staff } = await admin.from('profiles').select('id').in('rolle', ['dispatch', 'admin'])
    const { titel, beschreibung } = buildCallNotificationText({ fromNumber, quelle, status, duration })
    const link = pickNotificationLink(leadId, fallId)
    for (const s of staff ?? []) {
      createNotification(s.id, 'eingehender-anruf', titel, beschreibung, link).catch(() => {})
    }
  } catch {
    // non-critical — darf den Status nicht brechen
  }

  // 7. Call-Record speichern.
  const { error: insertError } = await admin.from('matelso_calls').upsert(
    {
      external_call_id: externalCallId,
      direction: 'inbound',
      status,
      status_raw: event.anruf_status ?? null,
      from_number: fromNumber || null,
      to_number: toNumber || null,
      duration,
      quelle,
      started_at: startedAtIso,
      lead_id: leadId,
      claim_id: claimId,
      // Zod-passthrough-Typ ist nicht direkt jsonb-zuweisbar; bewusster Double-Cast.
      raw_payload: event as unknown as Record<string, unknown>,
    },
    { onConflict: 'external_call_id' },
  )
  if (insertError) {
    return NextResponse.json({ error: 'DB insert failed', detail: insertError.message }, { status: 500 })
  }

  // 8. OK.
  // CMM-49: Webhook-Ack reportet jetzt claim_id (matelso konsumiert das Feld nicht zurück).
  return NextResponse.json({ ok: true, lead_id: leadId, claim_id: claimId, is_new_lead: isNewLead })
}
