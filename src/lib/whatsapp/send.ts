// Multi-Channel Send-Wrapper. Eine zentrale Funktion für alle Out-Sends:
//
//   sendNachricht({ entity, entityId, phone, email, text, fallback })
//
// Logik:
//   1. WA-Verfügbarkeit aus DB-Cache lesen (oder fresh-checken via Baileys)
//   2. Wenn verfügbar → Baileys /send
//   3. Wenn nicht / Service down → Fallback-Channels in Reihenfolge probieren
//   4. Audit-Log in nachrichten-Tabelle (Multi-Channel-Inbox-ready)
//
// Caller muss bereits eingelogged sein ODER über Service-Role schreiben —
// dieser Wrapper nutzt createAdminClient für nachrichten-Insert weil
// public-Funnel-Sends keinen Auth-Kontext haben.

import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from './baileys-client'
import {
  checkAndCacheAvailability,
  getCachedAvailability,
} from './availability'

export type SendChannel = 'whatsapp' | 'sms' | 'email' | 'none'

type Entity = 'lead' | 'profile' | 'gfa'

export type SendNachrichtInput = {
  entity: Entity
  entityId: string
  phone: string | null | undefined
  text: string

  /** Fallback-Channels falls WA nicht möglich. Default: keine. */
  fallback?: Array<'sms' | 'email'>

  /** Email-Adresse für Email-Fallback. */
  email?: string | null

  /** Optional: Fall-ID für Audit-Log-Verknüpfung. */
  fallId?: string | null

  /** Templating-Schlüssel für nachrichten.template_key. */
  templateKey?: string | null

  /** Empfänger-Rolle für nachrichten.empfaenger_rolle. */
  empfaengerRolle?: 'kunde' | 'sachverstaendiger' | 'dispatch' | 'admin'
}

export type SendNachrichtResult = {
  ok: boolean
  channel: SendChannel
  messageId?: string | null
  error?: string
  /** WA-Verfügbarkeit zum Zeitpunkt des Sends (für Telemetrie). */
  whatsappVerfuegbar: boolean | null
}

export async function sendNachricht(
  input: SendNachrichtInput,
): Promise<SendNachrichtResult> {
  const { entity, entityId, phone, text, fallback = [], email, fallId, templateKey, empfaengerRolle } = input

  if (!text || text.trim().length === 0) {
    return { ok: false, channel: 'none', error: 'empty text', whatsappVerfuegbar: null }
  }

  // 1) WA-Status aus Cache lesen — kein Lookup, das wäre zu langsam für
  //    bulk-Sends. Caller hat normalerweise schon checkAndCacheAvailability
  //    beim Lead-Insert ausgelöst. Wenn Cache leer: jetzt nachholen.
  let waStatus = await getCachedAvailability(entity, entityId)
  if (waStatus.geprueftAm === null && phone) {
    const fresh = await checkAndCacheAvailability(entity, entityId, phone)
    waStatus = { verfuegbar: fresh.verfuegbar, geprueftAm: fresh.geprueftAm }
  }

  // 2) WA-Send wenn verfügbar
  if (phone && waStatus.verfuegbar === true) {
    const sent = await sendWhatsAppText(phone, text)
    if (sent.ok) {
      await logNachricht({
        kanal: 'whatsapp',
        empfaengerEntity: entity,
        empfaengerId: entityId,
        empfaengerRolle,
        empfaengerKontakt: phone,
        text,
        templateKey,
        fallId,
        externalId: sent.messageId,
      })
      return {
        ok: true,
        channel: 'whatsapp',
        messageId: sent.messageId,
        whatsappVerfuegbar: true,
      }
    }
    // WA-Send schiefgegangen → trotzdem Audit-Log mit Fehler, dann Fallback
    await logNachricht({
      kanal: 'whatsapp',
      empfaengerEntity: entity,
      empfaengerId: entityId,
      empfaengerRolle,
      empfaengerKontakt: phone,
      text,
      templateKey,
      fallId,
      externalId: null,
      fehler: sent.error,
    })
    // wenn recipient_not_on_whatsapp → DB-Cache war stale, fix:
    if (sent.code === 'recipient_not_on_whatsapp') {
      const admin = createAdminClient()
      const tableMap: Record<Entity, string> = {
        lead: 'leads',
        profile: 'profiles',
        gfa: 'gutachter_finder_anfragen',
      }
      void admin
        .from(tableMap[entity])
        .update({ whatsapp_verfuegbar: false, whatsapp_geprueft_am: new Date().toISOString() })
        .eq('id', entityId)
        .then(() => {})
    }
  }

  // 3) Fallback-Channels durchgehen
  for (const ch of fallback) {
    if (ch === 'sms' && phone) {
      // TODO PR #4: Twilio-SMS-Send hier einhaken — heute placeholder
      // Wir loggen den Versuch + returnen, der echte Send erfolgt wenn
      // sendStatusSms() Wrapper migriert wird.
      console.info('[whatsapp/send] sms-fallback noch nicht migriert', {
        entity,
        entityId,
        templateKey,
      })
      continue
    }
    if (ch === 'email' && email) {
      // TODO PR #4: Resend-Email-Send hier einhaken
      console.info('[whatsapp/send] email-fallback noch nicht migriert', {
        entity,
        entityId,
        templateKey,
      })
      continue
    }
  }

  return {
    ok: false,
    channel: 'none',
    error: phone
      ? waStatus.verfuegbar === false
        ? 'no whatsapp + no fallback configured'
        : 'whatsapp unavailable + fallback not yet implemented'
      : 'no phone',
    whatsappVerfuegbar: waStatus.verfuegbar,
  }
}

// ─── Audit-Log in nachrichten ──────────────────────────────────────

async function logNachricht(args: {
  kanal: 'whatsapp' | 'sms' | 'email'
  empfaengerEntity: Entity
  empfaengerId: string
  empfaengerRolle?: string
  empfaengerKontakt: string
  text: string
  templateKey?: string | null
  fallId?: string | null
  externalId?: string | null
  fehler?: string
}): Promise<void> {
  const admin = createAdminClient()
  try {
    await admin.from('nachrichten').insert({
      fall_id: args.fallId ?? null,
      kanal: args.kanal,
      sender_id: null,
      sender_rolle: 'system',
      richtung: 'outbound',
      nachricht: args.text,
      hat_anhang: false,
      gelesen: false,
      // Audit-Felder aus Migration 20260510123128
      empfaenger_kontakt: args.empfaengerKontakt,
      template_key: args.templateKey ?? null,
      external_message_id: args.externalId ?? null,
      fehlermeldung: args.fehler ?? null,
      status: args.fehler ? 'fehlgeschlagen' : 'gesendet',
    })
  } catch (err) {
    // Audit-Log-Fehler darf den Send nicht brechen
    console.error('[whatsapp/send] log fail:', err)
  }
}
