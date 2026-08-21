import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { processInboundText } from '@/lib/inbound/process-inbound-text'
import { processInboundMedia, type InboundMediaFile } from '@/lib/inbound/process-inbound-media'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import type { SupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Eingehende WhatsApp-Nachrichten vom Baileys-VPS-Service.
 * Baileys postet hierher bei jedem messages.upsert-Event.
 *
 * Wir schreiben die Nachricht in nachrichten (richtung='inbound')
 * und verknüpfen sie mit dem Lead/Fall wenn eine Telefonnummer-Übereinstimmung
 * gefunden wird. Danach: Text-Intent-Prozessor (JA/NEIN/embed-B/Umtermin) —
 * gleiche Shared-Helper wie die (Legacy-)Twilio-Route.
 * Medien-Intents: Task C — bytes-neutral via processInboundMedia.
 */
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone?: string
    text?: string
    message_id?: string
    timestamp?: number
    has_media?: boolean
    // Task C: Media-Entries mit bereits aufgeloesten oder aufloesbarenBytes.
    // Mindestens eine Quelle muss vorhanden sein: storage_path | url | base64.
    // Fehlendes Feld = Eintrag wird beim Resolve uebersprungen.
    media?: Array<{
      storage_path?: string
      url?: string
      base64?: string
      mime?: string
      filename?: string
    }>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 })
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : ''
  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const messageId = typeof body.message_id === 'string' ? body.message_id : null

  if (!phone || phone.length < 8) {
    return NextResponse.json({ error: 'missing_phone' }, { status: 400 })
  }

  const db = createAdminClient()

  // Deduplizierung via external_message_id — Baileys liefert manchmal Duplikate
  if (messageId) {
    const { data: existing } = await db
      .from('nachrichten')
      .select('id')
      .eq('external_message_id', messageId)
      .maybeSingle()
    if (existing) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'duplicate' })
    }
  }

  // Multi-Fall-aware Matching via matchInboundToFall (identisch zur Twilio-Route).
  // Merge-Resolution vs CMM-74 b" (7d83328c3): die inline faelle/claims-Statusabfrage
  // (dort auf operative_status repointed) ist hier obsolet — der Shared-Matcher
  // matchInboundToFall kapselt die (CMM-74-konforme) Fall-Auswahl. Ein einziger SSoT.
  const match = await matchInboundToFall(db, phone)
  const fallId = match.fallId
  const leadId = match.leadId

  // Zustellungs-Routing (Inbound): die eingehende WhatsApp am kunde_gruppe-Thread des Claims
  // verankern -> in v1 (kanal) UND v2 (thread) sichtbar (Datenmodell A). Get-or-create via Service
  // (service-role, kein Auth) -> auch Claims OHNE bestehenden Thread bekommen die Inbound-Nachricht
  // sofort thread-nativ (+ SV/KB werden als Teilnehmer resolved). Non-critical -> Fehler = threadId null.
  let threadId: string | null = null
  if (fallId) {
    const claimIdForThread = await resolveClaimId(db, fallId)
    if (claimIdForThread) {
      const { holeOderErstelleGruppenThreadService } = await import('@/lib/chat/thread-service')
      threadId = await holeOderErstelleGruppenThreadService(
        db as unknown as SupabaseClient,
        claimIdForThread,
        'kunde_gruppe',
      ).catch(() => null)
    }
  }

  const { error } = await db.from('nachrichten').insert({
    fall_id: fallId,
    // matchInboundToFall liefert den Lead auch dann, wenn (noch) kein Fall dranhaengt
    // (Interessent vor der Konversion). Ohne diese Spalte war der Bezug nur im
    // HTTP-Response sichtbar und ging verloren — die Zeile blieb dauerhaft
    // unverknuepft. Gemessen 21.08.: 200/200 inbound-WA-Nachrichten ohne jeden Bezug.
    lead_id: leadId,
    thread_id: threadId,
    kanal: 'whatsapp',
    sender_id: null,
    sender_rolle: 'kunde',
    richtung: 'inbound',
    nachricht: text || '[Medien-Nachricht]',
    hat_anhang: body.has_media === true,
    gelesen: false,
    empfaenger_kontakt: phone,
    external_message_id: messageId,
    status: 'zugestellt',
  })

  if (error) {
    console.error('[baileys/inbound] DB-Insert-Fehler:', error)
    return NextResponse.json({ error: 'db_error', detail: error.message }, { status: 500 })
  }

  // Text-Intents (JA/NEIN/Umtermin) — embed-B-Resolution + Termin-Bestaetigung.
  // Shared-Helper identisch zur (legacy) Twilio-Route.
  try {
    await processInboundText(db, { fromPhone: phone, body: text, match })
  } catch (e) {
    console.error('[baileys/inbound] text-intent:', e instanceof Error ? e.message : e)
  }

  // ─── Medien-Block (Task C) ─────────────────────────────────────────────────
  if (Array.isArray(body.media) && body.media.length > 0) {
    // Bytes aufloesen: jeder Entry wird unabhaengig versucht (storage_path → url → base64).
    // Fehlgeschlagene Entries werden uebersprungen, kein Hard-Fail des gesamten Requests.
    const mediaFiles: InboundMediaFile[] = []
    for (const entry of body.media) {
      try {
        let buffer: Buffer | null = null
        if (entry.storage_path) {
          const { data, error } = await db.storage
            .from('fall-dokumente')
            .download(entry.storage_path)
          if (!error && data) {
            buffer = Buffer.from(await data.arrayBuffer())
          } else {
            console.warn('[baileys/inbound] storage_path download fehlgeschlagen:', error?.message)
          }
        } else if (entry.url) {
          const res = await fetch(entry.url)
          if (res.ok) {
            buffer = Buffer.from(await res.arrayBuffer())
          } else {
            console.warn('[baileys/inbound] URL download fehlgeschlagen:', res.status, entry.url)
          }
        } else if (entry.base64) {
          buffer = Buffer.from(entry.base64, 'base64')
        }
        if (buffer) {
          mediaFiles.push({
            buffer,
            mime: entry.mime ?? 'image/jpeg',
            filename: entry.filename,
          })
        }
      } catch (err) {
        console.error('[baileys/inbound] media-resolve Fehler:', err instanceof Error ? err.message : err)
      }
    }

    if (mediaFiles.length > 0) {
      await processInboundMedia(db, {
        fromPhone: phone,
        leadId,
        fallId,
        mediaFiles,
      }).catch((e) => console.error('[baileys/inbound] media:', e instanceof Error ? e.message : e))
    }
  } else if (body.has_media === true) {
    // Medien-Bytes-Pfad scharf erst nach Worker-Contract (Task C / docs).
    // Aktuell liefert der Baileys-Worker nur has_media:true ohne Bytes.
    // Die nachrichten-Row hat hat_anhang:true — Sicherheits-Notification
    // damit kein Media-Eingang lautlos verloren geht.
    try {
      let ownerUserId: string | null = null
      let ownerLink = '/dispatch'
      if (leadId) {
        const { data: leadRow } = await db
          .from('leads')
          .select('zugewiesen_an')
          .eq('id', leadId)
          .maybeSingle()
        ownerUserId = (leadRow?.zugewiesen_an as string | null) ?? null
        ownerLink = `/dispatch/leads/${leadId}`
      } else if (fallId) {
        // CMM-49: kundenbetreuer_id claims-direkt (faelle-frei). ownerLink behält
        // fallId (Route löst via resolveClaimId auf).
        const claimId = await resolveClaimId(db, fallId)
        const { data: claim } = claimId
          ? await db.from('claims').select('kundenbetreuer_id').eq('id', claimId).maybeSingle()
          : { data: null }
        ownerUserId = (claim?.kundenbetreuer_id as string | null) ?? null
        ownerLink = `/faelle/${fallId}`
      }
      if (ownerUserId) {
        const { createNotification } = await import('@/lib/notifications')
        await createNotification(
          ownerUserId,
          'wa-medien-eingegangen',
          'Medien-Nachricht per WhatsApp',
          'Eine WhatsApp-Nachricht mit Medien ist eingegangen, aber der Baileys-Worker liefert die Datei noch nicht aus. Bitte im Chat prüfen.',
          ownerLink,
        ).catch(() => {})
      } else {
        console.warn('[baileys/inbound] has_media=true aber kein Owner-User gefunden — kein Notification-Versand. Phone:', phone)
      }
    } catch (err) {
      console.error('[baileys/inbound] has_media Fallback-Notification Fehler:', err instanceof Error ? err.message : err)
    }
  }

  return NextResponse.json({
    ok: true,
    lead_id: leadId,
    fall_id: fallId,
  })
}
