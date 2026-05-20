'use server'

// AAR-902 Prototyp: Server-Action fuer den Mini-Wizard.
// 1. Lead einfuegen (4 Felder + Defaults), Disqualifikation bei
//    schuldfrage='eigenverantwortung'
// 2. flow_links-Token erstellen (72h gueltig)
// 3. Magic-Link per Email an Lead.email senden
//    (Baileys/WhatsApp folgt in PR 1+2 der AAR-897-Strecke)
// 4. Liefert { redirect } zurueck — Caller (Client-Component) navigiert.
//
// Anonyme Aktion: kein auth.getUser, /schaden-melden ist public.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { resolvePromoCodeToId } from '@/lib/flow/resolve-promo'
import { miniWizardSchema, type MiniWizardInput } from '@/lib/flow/schemas/mini-wizard'
import { dispatchMagicLink } from '@/lib/magic-link/dispatch-magic-link'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { createNotification } from '@/lib/notifications'

type Result =
  | {
      success: true
      leadId: string
      redirectTo: string
      kanal: 'whatsapp' | 'email' | 'disqualifiziert'
    }
  | { success: false; error: string }

export async function createLeadFromMiniWizard(input: MiniWizardInput): Promise<Result> {
  const parsed = miniWizardSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: parsed.error.issues.map((i) => i.message).join('; '),
    }
  }

  const data = parsed.data
  const isDisqualifiziert = data.schuldfrage === 'eigenverantwortung'
  const locale = await getLocaleCookie()

  // 15.05.2026: Promo-Code aus FormData (data.promoCode) statt aus Cookie.
  // Cookie-Layer entfernt, weil cookies().set() im Server-Component-Render-
  // Pfad in Next 16+ crasht (Sentry NEXTJS-8/9 + Digests 890686022,
  // 2237539019, 2740258766 — drei Crash-Quellen, weder PR #1308 noch #1319
  // konnten alle dauerhaft schließen). page.tsx liest `?p=<code>` aus URL,
  // gibt es als Prop an MiniWizardClient; Form transportiert es als hidden
  // field. Zod-Schema prüft das Format schon, isValidPromoCodeFormat hier
  // als Defense-in-Depth gegen direkte Action-Calls.
  let promotionCodeId: string | null = null
  if (data.promoCode && isValidPromoCodeFormat(data.promoCode)) {
    promotionCodeId = await resolvePromoCodeToId(data.promoCode)
  }

  const admin = createAdminClient()

  // Via zentrale createLead() (Writer-Konsistenz, leads-Audit 15.05.2026).
  const created = await createLead(
    admin,
    {
      source_channel: 'mini_wizard',
      status: isDisqualifiziert ? 'disqualifiziert' : 'neu',
      vorname: data.vorname,
      nachname: data.nachname,
      telefon: data.telefon,
      email: data.email,
    },
    {
      schuldfrage: data.schuldfrage,
      unfalldatum: data.unfalldatum,
      unfallort: data.unfallort,
      sprache: locale,
      qualifizierungs_phase: isDisqualifiziert ? 'disqualifiziert' : 'in-qualifizierung',
      disqualifiziert: isDisqualifiziert,
      disqualifiziert_grund_key: isDisqualifiziert ? 'eigenverantwortung' : null,
      disqualifiziert_am: isDisqualifiziert ? new Date().toISOString() : null,
      promotion_code_id: promotionCodeId,
    },
  )

  if (!created.ok) {
    return {
      success: false,
      error: created.error,
    }
  }
  const lead = { id: created.leadId }

  // Selbstverschulden: Lead bleibt in DB, kein Magic-Link
  if (isDisqualifiziert) {
    revalidatePath('/dispatch/leads')
    return {
      success: true,
      leadId: lead.id as string,
      redirectTo: '/schaden-melden/selbstverschulden',
      kanal: 'disqualifiziert',
    }
  }

  // AAR-908 Gap 2: Geocoding fire-and-forget. unfallort → unfallort_lat/lng.
  // signSAandCreateFall (im Magic-Link-Klick-Pfad) liest die Koordinaten + ruft
  // findBestSV — damit wird der SV automatisch zugewiesen ohne Dispatcher.
  // Wenn Geocoding fehlschlaegt: Lead bleibt ohne Koords, findBestSV greift
  // nicht, FlowWizardKfz Step 2 zeigt Soft-Empty-State (heutiges Verhalten).
  //
  // AAR-1482: bei Geocoding-Failure (null von Mapbox ODER Exception) jetzt
  // Notification an alle dispatch-User. Sonst war der Failure silent — der
  // Lead landete in /dispatch/leads, aber Triage-Karte zeigte ihn nicht
  // (keine Koords), ohne Hinweis warum. Notification gibt dem Dispatcher
  // klaren Trigger zur manuellen Recherche.
  void (async () => {
    let geocoded = false
    let failureReason: string | null = null
    try {
      const geo = await geocodeAdresse(data.unfallort)
      if (geo) {
        await admin
          .from('leads')
          .update({
            unfallort_lat: geo.lat,
            unfallort_lng: geo.lng,
            // unfallort wird mit der formatierten Adresse ersetzt, damit
            // SA-PDF und Onboarding-Texte saubere Adressen zeigen.
            unfallort: geo.formatted,
            updated_at: new Date().toISOString(),
          })
          .eq('id', lead.id as string)
        geocoded = true
      } else {
        failureReason = 'Mapbox lieferte kein Ergebnis (Adresse moeglicherweise unklar)'
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.warn('[AAR-908] Geocoding fail (non-critical):', msg)
      failureReason = `Mapbox-Fehler: ${msg}`
    }

    if (!geocoded) {
      // Notification an alle dispatch-User. Fire-and-forget innerhalb der IIFE —
      // falls einzelne Notifications fehlschlagen, soll der gesamte Mini-Wizard-
      // Flow nicht abbrechen (Lead + Magic-Link sind die wichtigeren Pfade).
      try {
        const { data: dispatcher } = await admin
          .from('profiles')
          .select('id')
          .in('rolle', ['dispatch', 'admin'])
        const fullName = [data.vorname, data.nachname].filter(Boolean).join(' ') || 'Lead'
        const beschreibung = `Adresse "${data.unfallort}" konnte nicht geocoded werden — Lead in /dispatch/leads, aber nicht auf Triage-Karte sichtbar. Grund: ${failureReason ?? 'unbekannt'}.`
        for (const d of dispatcher ?? []) {
          await createNotification(
            d.id as string,
            'lead-geocoding-fail',
            `Geocoding fehlgeschlagen: ${fullName}`,
            beschreibung,
            `/dispatch/leads/${lead.id as string}`,
          ).catch(() => { /* non-critical */ })
        }
      } catch (notifyErr) {
        console.warn(
          '[AAR-1482] Geocoding-Fail-Notification konnte nicht gesendet werden:',
          notifyErr instanceof Error ? notifyErr.message : notifyErr,
        )
      }
    }
  })()

  // flow_links Token erstellen — 72h gueltig wie im Dispatch-Flow
  const { data: flowLink, error: flowErr } = await admin
    .from('flow_links')
    .insert({
      lead_id: lead.id as string,
      expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
      service_typ: 'komplett',
      sprache: locale,
    })
    .select('token')
    .single()

  if (flowErr || !flowLink) {
    return {
      success: false,
      error: flowErr?.message ?? 'Magic-Link-Token konnte nicht erstellt werden',
    }
  }

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  const flowUrl = `${baseUrl}/flow/${flowLink.token as string}`

  // AAR-899: Kanal-Switch via dispatchMagicLink (WA bevorzugt, Email-Fallback).
  // Nutzt das existierende lib/whatsapp-Subsystem (availability + baileys-
  // client) — wenn WA verfuegbar geht der Magic-Link per WhatsApp raus,
  // sonst per Email. Lokal-Dev ohne BAILEYS_BASE_URL fallt sauber auf Email.
  const dispatched = await dispatchMagicLink({
    leadId: lead.id as string,
    telefon: data.telefon,
    email: data.email,
    vorname: data.vorname || null,
    flowUrl,
  })
  if (!dispatched.sent) {
    return {
      success: false,
      error: `Magic-Link konnte nicht versendet werden: ${dispatched.detail ?? 'unbekannter Fehler'}`,
    }
  }

  // Lead-Status aktualisieren + Timeline-Eintrag
  await admin
    .from('leads')
    .update({
      qualifizierungs_phase: 'flow-versendet',
      status: 'flow-gesendet',
      updated_at: new Date().toISOString(),
    })
    .eq('id', lead.id as string)

  const kanalLabel = dispatched.kanal === 'whatsapp' ? 'WhatsApp' : 'Email'
  await admin
    .from('timeline')
    .insert({
      lead_id: lead.id as string,
      fall_id: null,
      typ: 'system',
      titel: `Mini-Wizard: Magic-Link per ${kanalLabel} versendet`,
      beschreibung: `An ${dispatched.kanal === 'whatsapp' ? data.telefon : data.email} — Schuldfrage: ${data.schuldfrage}, Unfallort: ${data.unfallort}`,
    })
    .then(() => {}, () => {})

  revalidatePath('/dispatch/leads')

  return {
    success: true,
    leadId: lead.id as string,
    redirectTo: `/schaden-melden/link-versendet?email=${encodeURIComponent(data.email)}&kanal=${dispatched.kanal}`,
    kanal: dispatched.kanal === 'whatsapp' ? 'whatsapp' : 'email',
  }
}
