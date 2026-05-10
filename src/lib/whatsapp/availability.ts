// WhatsApp-Verfügbarkeits-Check mit DB-Cache.
//
// Pattern: erst DB-Cache lesen → wenn frisch: zurückgeben. Wenn stale
// oder NULL: Baileys-Lookup → DB-Update → zurückgeben.
//
// Cache-TTL: 30 Tage. Phone-Update invalidiert automatisch via DB-Trigger
// (siehe Migration 20260510121700_whatsapp_verfuegbarkeit.sql).
//
// Nicht für blocking-UI verwenden — die Lookup-Roundtrip kann 1-2s dauern.
// Pattern: in Server-Action fire-and-forget, UI rendert mit dem zuletzt
// gecached'ten Wert (NULL = "wird gerade geprüft").

import { createAdminClient } from '@/lib/supabase/admin'
import { isOnWhatsApp } from './baileys-client'

const CACHE_TTL_DAYS = 30
const CACHE_TTL_MS = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000

type Entity = 'lead' | 'profile'

export type AvailabilityResult = {
  verfuegbar: boolean | null  // null = unbekannt (Service down + nichts im Cache)
  geprueftAm: string | null   // ISO-Date
  cacheHit: boolean           // false = frisch von Baileys geholt
  source: 'cache' | 'baileys' | 'service_unavailable' | 'no_phone'
}

/**
 * Liest den Cache-Status aus der DB. Macht KEINEN Lookup.
 * Wird vom Send-Wrapper genutzt um in Sub-Millisekunden zu entscheiden
 * ob WA-Send überhaupt versucht werden soll.
 */
export async function getCachedAvailability(
  entity: Entity,
  entityId: string,
): Promise<{ verfuegbar: boolean | null; geprueftAm: string | null }> {
  const admin = createAdminClient()
  const table = entity === 'lead' ? 'leads' : 'profiles'
  const { data } = await admin
    .from(table)
    .select('whatsapp_verfuegbar, whatsapp_geprueft_am')
    .eq('id', entityId)
    .single<{ whatsapp_verfuegbar: boolean | null; whatsapp_geprueft_am: string | null }>()
  return {
    verfuegbar: data?.whatsapp_verfuegbar ?? null,
    geprueftAm: data?.whatsapp_geprueft_am ?? null,
  }
}

/**
 * Prüft WA-Verfügbarkeit + cached das Ergebnis in der DB. Cache-TTL 30 Tage.
 *
 * - Wenn der Cache frisch ist (geprüft_am < 30d alt) → kein API-Call
 * - Wenn Cache stale oder NULL → Baileys /check → DB-Update
 * - Wenn Baileys nicht erreichbar UND Cache leer → returns verfuegbar=null
 *   (Caller sollte fallback auf SMS/Email)
 *
 * Idempotent + safe in Server-Actions, fire-and-forget möglich (kein await).
 */
export async function checkAndCacheAvailability(
  entity: Entity,
  entityId: string,
  phone: string | null | undefined,
): Promise<AvailabilityResult> {
  if (!phone || phone.trim().length < 6) {
    return {
      verfuegbar: null,
      geprueftAm: null,
      cacheHit: false,
      source: 'no_phone',
    }
  }

  const admin = createAdminClient()
  const table = entity === 'lead' ? 'leads' : 'profiles'

  // 1) Cache lesen
  const cached = await getCachedAvailability(entity, entityId)
  if (cached.geprueftAm) {
    const age = Date.now() - new Date(cached.geprueftAm).getTime()
    if (age < CACHE_TTL_MS && cached.verfuegbar !== null) {
      return {
        verfuegbar: cached.verfuegbar,
        geprueftAm: cached.geprueftAm,
        cacheHit: true,
        source: 'cache',
      }
    }
  }

  // 2) Frisch checken via Baileys
  const lookup = await isOnWhatsApp(phone)
  if (!lookup.ok) {
    // Service down → wenn alter Cache existiert, ihn zurückgeben
    if (cached.verfuegbar !== null) {
      return {
        verfuegbar: cached.verfuegbar,
        geprueftAm: cached.geprueftAm,
        cacheHit: true,
        source: 'cache',
      }
    }
    return {
      verfuegbar: null,
      geprueftAm: null,
      cacheHit: false,
      source: 'service_unavailable',
    }
  }

  const verfuegbar = lookup.onWhatsApp
  const geprueftAm = new Date().toISOString()

  // 3) DB-Update — fire-and-forget, blockt Caller nicht bei DB-Latenz
  void admin
    .from(table)
    .update({
      whatsapp_verfuegbar: verfuegbar,
      whatsapp_geprueft_am: geprueftAm,
    })
    .eq('id', entityId)
    .then(({ error }) => {
      if (error) {
        console.error(
          `[whatsapp/availability] update fail ${entity}/${entityId}:`,
          error.message,
        )
      }
    })

  return {
    verfuegbar,
    geprueftAm,
    cacheHit: false,
    source: 'baileys',
  }
}

/**
 * Convenience-Wrapper: nur ein Boolean zurück. Wenn Service down + nichts
 * im Cache → false (defensive default — eher Email schicken als WA hoffen).
 */
export async function isWhatsAppAvailable(
  entity: Entity,
  entityId: string,
  phone: string | null | undefined,
): Promise<boolean> {
  const r = await checkAndCacheAvailability(entity, entityId, phone)
  return r.verfuegbar === true
}
