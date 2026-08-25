'use server'

// AAR-902 Prototyp: Server-Action fuer den Mini-Wizard.
// 1. Lead einfuegen (4 Felder + Defaults)
// 2. flow_links-Token erstellen (72h gueltig)
// 3. Magic-Link per Email an Lead.email senden
//    (Baileys/WhatsApp folgt in PR 1+2 der AAR-897-Strecke)
// 4. Liefert { redirect } zurueck — Caller (Client-Component) navigiert.
//
// Anonyme Aktion: kein auth.getUser, /schaden-melden ist public.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { isValidPromoCodeFormat } from '@/lib/flow/promo-attribution'
import { resolvePromoCodeToId } from '@/lib/flow/resolve-promo'
import { campaignSourceChannel, DEFAULT_SOURCE_CHANNEL } from '@/lib/flow/campaign-source'
import { pickRoundRobinDispatcher } from '@/lib/leads/pick-dispatcher'
import { miniWizardSchema, type MiniWizardInput } from '@/lib/flow/schemas/mini-wizard'
import { dispatchMagicLink } from '@/lib/magic-link/dispatch-magic-link'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { createNotification } from '@/lib/notifications'
import { getConsentedGaClientId, trackServerConversion } from '@/lib/analytics/ga4-conversions'
import { buildHashedUserData } from '@/lib/analytics/user-data-mp'

type Result =
  | {
      success: true
      leadId: string
      redirectTo: string
      kanal: 'whatsapp' | 'email'
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
  // Mapping-Audit 03.08.2026 (Befund B4): schuldfrage='eigenverantwortung' wurde
  // hier hart disqualifiziert (Sackgasse /selbstverschulden), obwohl die App
  // vollwertige Kasko-/Selbstzahler-Flows hat und der FlowLink-Quali-Step die
  // Versicherungsfrage nachholt (flow-kontext.ts quali_offen). Selbstschuld-Leads
  // laufen jetzt den normalen Magic-Link-Pfad.
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

  // QR-Kampagnen-Attribution (Strassen-Aktion etc.): ?src=<slug> -> source_channel.
  // campaignSourceChannel sanitisiert + namespaced ('kampagne-<slug>'); ohne / krummen
  // src faellt es auf 'mini_wizard' zurueck -> organischer Traffic bleibt identisch.
  const sourceChannel = campaignSourceChannel(data.src)

  const admin = createAdminClient()

  // GA4-Conversion-Attribution: client_id aus _ga-Cookie (nur bei Consent).
  const gaClientId = await getConsentedGaClientId()

  // Verlaessliche Dispatch-Zuweisung: explizit einen round-robin dispatch-User setzen
  // (nicht auf den KB-Auto-Trigger verlassen) -> der Lead hat immer einen Owner, den die
  // Bestaetigungsseite zeigt. Der KB-Trigger ueberschreibt einen gesetzten Owner nicht
  // (er legt nur seinen kb_beratung-Termin an). null = kein aktiver Dispatcher.
  const dispatcherId = await pickRoundRobinDispatcher(admin)

  // Via zentrale createLead() (Writer-Konsistenz, leads-Audit 15.05.2026).
  const created = await createLead(
    admin,
    {
      source_channel: sourceChannel,
      status: 'neu',
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
      qualifizierungs_phase: 'in-qualifizierung',
      promotion_code_id: promotionCodeId,
      zugewiesen_an: dispatcherId,
    },
  )

  if (!created.ok) {
    return {
      success: false,
      error: created.error,
    }
  }
  const lead = { id: created.leadId }

  // Compliance (UX-Audit #3): dsgvo_consent-Haken persistieren (war bisher nur validiert,
  // nie geloggt -> Art.-7-DSGVO-Nachweisbarkeit). Die Spalte leads.dsgvo_zustimmung_am wurde
  // mit Migration 20260704113818 ergaenzt (spiegelt anfragen/gutachter_finder_anfragen, die
  // dritte Intake-Tabelle hatte sie nie). `as never`, weil die generierten Marketing-database.types
  // die frische Spalte noch nicht kennen (Type-Lag; Regen aufgeschoben) -> ohne Cast braeche der
  // Deploy-Typecheck ("does not exist in type 'LeadUpdate'"; die CI-`build` deckt den Marketing-
  // Build NICHT ab, nur der Deploy). Type-Lag-Cast wie in der App. Consent ist per Schema
  // (safeParse oben) garantiert. Non-fatal.
  try {
    await admin
      .from('leads')
      .update({ dsgvo_zustimmung_am: new Date().toISOString() } as never)
      .eq('id', lead.id as string)
  } catch (err) {
    console.error('[mini-wizard] dsgvo_zustimmung_am persist fehlgeschlagen (non-fatal):', err)
  }

  // GA4: client_id auf dem Lead speichern (fuer spaetere flowlink_sent/sa_signed)
  // + generate_lead feuern (nur qualifizierte Leads, fire-and-forget).
  if (gaClientId) {
    await admin.from('leads').update({ ga_client_id: gaClientId }).eq('id', lead.id as string)
    void trackServerConversion(
      gaClientId,
      { name: 'generate_lead', params: { source: 'mini_wizard' } },
      buildHashedUserData({
        email: data.email,
        phone: data.telefon,
        firstName: data.vorname,
        lastName: data.nachname,
      }),
    )
  }

  // Email + WhatsApp via shared notifyNewLead (Aaron-Direktive 2026-05-20).
  const fullName = [data.vorname, data.nachname].filter(Boolean).join(' ') || data.email
  await notifyNewLead({
    leadId: lead.id as string,
    source: `Mini-Wizard /schaden-melden${
      sourceChannel !== DEFAULT_SOURCE_CHANNEL ? ` · ${sourceChannel}` : ''
    }`,
    name: fullName,
    phone: data.telefon,
    email: data.email,
    extraFields: [
      { label: 'Schuldfrage', value: data.schuldfrage },
      { label: 'Unfallort', value: data.unfallort },
      { label: 'Unfalldatum', value: data.unfalldatum },
    ],
  })

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
        const beschreibung = `Adresse "${data.unfallort}" konnte nicht geocoded werden – Lead in /dispatch/leads, aber nicht auf Triage-Karte sichtbar. Grund: ${failureReason ?? 'unbekannt'}.`
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
      beschreibung: `An ${dispatched.kanal === 'whatsapp' ? data.telefon : data.email} – Schuldfrage: ${data.schuldfrage}, Unfallort: ${data.unfallort}`,
    })
    .then(() => {}, () => {})

  revalidatePath('/dispatch/leads')

  return {
    success: true,
    leadId: lead.id as string,
    redirectTo: `/schaden-melden/link-versendet?lead=${lead.id as string}&email=${encodeURIComponent(data.email)}&kanal=${dispatched.kanal}`,
    kanal: dispatched.kanal === 'whatsapp' ? 'whatsapp' : 'email',
  }
}
