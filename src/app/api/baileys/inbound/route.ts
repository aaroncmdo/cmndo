import { NextResponse } from 'next/server'
import { assertCronAuth } from '@/lib/auth/cron-auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { matchInboundToFall } from '@/lib/inbound/match-fall'
import { processInboundText } from '@/lib/inbound/process-inbound-text'
import { processInboundMedia, type InboundMediaFile } from '@/lib/inbound/process-inbound-media'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { istPartnerNummer } from '@/lib/inbound/ist-partner-nummer'
import { createCase } from '@/lib/intake/create-case'
import { notifyTeamWhatsApp, istTeamNummer } from '@/lib/whatsapp/team-notify'
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
  // Vorher der Direktvergleich gegen `process.env.CRON_SECRET`: fehlt die Variable,
  // ergibt das "Bearer undefined" — genau dieser Header kaeme dann durch.
  // `assertCronAuth` ist fail-closed. Beide Aufrufer (services/baileys/src/index.js
  // und die Route-Tests) schicken `Authorization: Bearer <secret>`, die Semantik
  // bleibt also unveraendert.
  if (!assertCronAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: {
    phone?: string
    text?: string
    message_id?: string
    timestamp?: number
    has_media?: boolean
    /**
     * true = die Nachricht wurde von UNS gesendet (Handy, WhatsApp-Web oder ein
     * App-Send, der als Echo zurueckkommt). `phone` ist dann der EMPFAENGER.
     * Bis 23.08.2026 verwarf der Baileys-Service diese Nachrichten komplett
     * (`if (msg.key.fromMe) continue`) — im System sah jeder Verlauf einseitig
     * aus, und die 11 Direkt-Sender (FlowLink, Terminbestaetigung, …) hinter-
     * liessen ueberhaupt keine Spur: 800 Sends standen 36 DB-Zeilen gegenueber.
     */
    from_me?: boolean
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
  // Eigene Nachricht (vom Handy/Web/App-Echo) -> outbound. Sie wird gespeichert
  // und zugeordnet, loest aber KEINEN der Inbound-Effekte aus (kein Lead, keine
  // Team-WA, keine Text-Intents) — sonst wuerde ein eigenes "JA" einen Termin
  // bestaetigen und jede Antwort einen Interessenten erzeugen.
  const fromMe = body.from_me === true

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

  // Eine AUSGEHENDE Nachricht an eine TEAM-Nummer ist eine Benachrichtigung UEBER einen
  // Vorgang — keine Nachricht IM Vorgang. Der Telefon-Match trifft hier zwangslaeufig den
  // Lead des EMPFAENGERS: gemessen prod 30.08. 20:12 gingen zwei Team-WAs ueber Lead
  // 5c39b0ac raus und landeten an den Leads 159eac57 ("Trst Namewn") und f34c09ce ("Aaron
  // Sprafke") — genau den Leads, die die beiden Team-Nummern tragen. Zwei fremde Vorgaenge
  // trugen damit Nachrichten, die nicht zu ihnen gehoeren.
  //
  // Der Bezug ist hier nicht reparierbar (welcher Lead gemeint war, steht nur im Fliesstext),
  // aber KEIN Bezug ist richtiger als ein falscher. Betrifft nur das fromMe-Echo; echte
  // Inbound-Nachrichten einer Team-Nummer behalten ihre Zuordnung.
  const anTeamNummer = fromMe && istTeamNummer(phone)
  const fallId = anTeamNummer ? null : match.fallId
  let leadId = anTeamNummer ? null : match.leadId

  // ─── Erstkontakt von unbekannter Nummer ──────────────────────────────────
  // Weder Fall noch Lead: entweder ein Interessent, der zum ersten Mal schreibt,
  // oder ein Partner/Staff. `matchInboundToFall` prueft nur `rolle='kunde'` —
  // ein SV oder Admin gilt dort als „unbekannt" und wuerde sonst als Kunden-Lead
  // in der Dispatch-Warteschlange landen (gemessen 23.08.: 4 von 20 Absendern).
  //
  // MUSS vor dem nachrichten-Insert stehen, sonst bleibt lead_id auf der Zeile leer.
  // Spec: docs/superpowers/specs/2026-08-23-whatsapp-erstkontakt-lead-design.md
  let partnerBezeichnung: string | null = null
  let neuerLead = false
  if (!fromMe && !fallId && !leadId) {
    const partner = await istPartnerNummer(db, phone)
    if (partner.istPartner) {
      partnerBezeichnung = partner.bezeichnung
    } else {
      // mode 'lead-first': eine Nachricht ist noch kein Fall — die Konversion
      // laeuft spaeter ueber /flow. Kein dedup-Key: der generische ist ohne
      // Kennzeichen unbrauchbar (dedupKeyIsUsable), und der praezisere
      // Telefon-Abgleich lief eine Zeile vorher ueber matchInboundToFall — beim
      // zweiten Kontakt findet der den hier erzeugten Lead. Identische
      // Begruendung wie im matelso-/Aircall-Pfad.
      const created = await createCase(db, {
        mode: 'lead-first',
        base: { source_channel: 'whatsapp-inbound', status: 'neu', telefon: phone },
        extra: {
          qualifizierungs_phase: 'neu',
          notiz: `Auto-erstellt durch WhatsApp-Erstkontakt. Erste Nachricht: ${
            text ? `"${text.slice(0, 200)}"` : '[Medien-Nachricht]'
          }`,
        },
      })
      if (created.ok) {
        leadId = created.leadId
        neuerLead = true
      } else {
        console.error('[baileys/inbound] createCase fehlgeschlagen (non-fatal):', created.error)
      }
    }
  }

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
    // 'system' ist der etablierte Wert fuer von uns ausgehende Nachrichten
    // (120 Bestandszeilen); 'kunde'/'inbound' bleibt der Eingangsfall.
    sender_rolle: fromMe ? 'system' : 'kunde',
    richtung: fromMe ? 'outbound' : 'inbound',
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

  // ─── Team-Benachrichtigung bei NEUKONTAKT (Aaron 23.08.) ─────────────────
  // Regel: genau EINE WhatsApp an WA_TEAM_EMPFAENGER, wenn eine Nummer zum
  // ERSTEN MAL schreibt. Folgenachrichten derselben Nummer melden nicht erneut.
  //
  // Der Erstkontakt wird am Nachrichten-Bestand gemessen, NICHT daran, ob ein
  // Lead entstand: ein Partner bekommt bewusst keinen Lead, also faende
  // matchInboundToFall ihn auch beim naechsten Mal nicht — er wuerde bei JEDER
  // Nachricht erneut melden. Der Zaehler ist der einzige Marker, der fuer alle
  // drei Faelle (neuer Lead, Partner, Bestandskunde) gleich funktioniert.
  //
  // Bewusst NACH der Fehlerpruefung: sonst meldeten wir eine Nachricht, die gar
  // nicht gespeichert wurde. Die soeben eingefuegte Zeile zaehlt mit -> beim
  // echten Erstkontakt ist das Ergebnis exakt 1.
  // Non-critical: Fehler werden geloggt, brechen die Route nie.
  //
  // `!fromMe` als aeussere Bedingung — NICHT als frueher `return` im try-Block:
  // das haette die ganze Route beendet (keine Text-Intents, kein Medien-Block,
  // keine Response). Wir benachrichtigen uns nicht ueber das, was wir selbst
  // geschrieben haben.
  if (!fromMe) {
    try {
    const { count, error: zaehlFehler } = await db
      .from('nachrichten')
      .select('id', { count: 'exact', head: true })
      .eq('kanal', 'whatsapp')
      .eq('richtung', 'inbound')
      .eq('empfaenger_kontakt', phone)

    if (zaehlFehler) {
      // Lieber nicht melden als bei jeder Folgenachricht zu melden — eine
      // Benachrichtigung, die zu oft kommt, wird ignoriert wie die Task-Liste.
      console.error('[baileys/inbound] Erstkontakt-Zaehlung fehlgeschlagen:', zaehlFehler.message)
    } else if (count === 1) {
      const auszug = (text || '[Medien-Nachricht]').slice(0, 160)
      const basis = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const kopf = partnerBezeichnung
        ? `🏢 Neue WhatsApp von ${partnerBezeichnung}`
        : neuerLead
          ? '🆕 Neue WhatsApp — neuer Interessent'
          : '💬 Neue WhatsApp von einem bekannten Kontakt'
      const ziel = neuerLead && leadId ? `${basis}/dispatch/leads/${leadId}` : null
      await notifyTeamWhatsApp(
        [kopf, '', `📞 ${phone}`, `💬 ${auszug}`, ziel ? '' : null, ziel].filter(Boolean).join('\n'),
      )
    }
    } catch (err) {
      console.error('[baileys/inbound] Team-WA fehlgeschlagen (nicht kritisch):', err)
    }
  }

  // Text-Intents (JA/NEIN/Umtermin) — embed-B-Resolution + Termin-Bestaetigung.
  // Shared-Helper identisch zur (legacy) Twilio-Route.
  //
  // NUR fuer eingehende Nachrichten: ein von UNS geschriebenes "JA" wuerde sonst
  // einen Termin im Namen des Kunden bestaetigen. Genau deshalb ist `fromMe`
  // nicht bloss ein Anzeige-Detail, sondern eine Weiche.
  if (!fromMe) {
    try {
      await processInboundText(db, { fromPhone: phone, body: text, match })
    } catch (e) {
      console.error('[baileys/inbound] text-intent:', e instanceof Error ? e.message : e)
    }
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
