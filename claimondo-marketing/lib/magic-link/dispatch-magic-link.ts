// AAR-899: Magic-Link-Versand mit Kanal-Switch — WhatsApp bevorzugt,
// Email-Fallback. Wiederverwendet das existierende WhatsApp-Subsystem
// (src/lib/whatsapp/{availability,baileys-client}) statt eigenen Code.
//
// Pattern aus src/lib/whatsapp/send.ts:
//   1. WhatsApp-Verfuegbarkeit aus DB-Cache lesen (whatsapp_verfuegbar /
//      whatsapp_geprueft_am auf leads). Bei Cache-Miss live nachfragen.
//   2. Wenn verfuegbar → Baileys /send.
//   3. Bei Fehler oder nicht verfuegbar → Email-Fallback via existing
//      sendMiniWizardMagicLink (AAR-902).
//
// Lokal-Dev ohne BAILEYS_BASE_URL: existing baileys-client liefert
// service_unavailable → fall durch zu Email.
//
// Spec: docs/14.05.2026/mini-wizard-magic-link-konzept.md §Magic-Link-Versand.

import {
  getCachedAvailability,
  checkAndCacheAvailability,
} from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendMiniWizardMagicLink } from '@/lib/email/google/flows'
import { createAdminClient } from '@/lib/supabase/admin'
import { trackServerConversion } from '@/lib/analytics/ga4-conversions'

export type DispatchKanal = 'whatsapp' | 'email' | 'failed'

export type DispatchResult = {
  kanal: DispatchKanal
  sent: boolean
  detail?: string
}

/**
 * Die erste Nachricht, die JEDER Marketing-Lead bekommt — entsprechend sorgfaeltig formuliert.
 *
 * Frueher stand hier "Mit einem Klick legst du SA + Vollmacht ab". "SA" ist die
 * Sicherungsabtretung; kein Kunde weiss das. Bei einer rechtlich bindenden Unterschrift
 * ist eine Abkuerzung, die der Unterzeichnende nicht versteht, das falsche Mittel —
 * deshalb beide Dokumente ausgeschrieben plus ein Satz, WOFUER sie sind.
 *
 * ⚠ Die Kostenaussage lautet bewusst "unser Service ist fuer dich kostenlos" und NICHT
 * "du zahlst nichts". Der Unterschied ist nicht kosmetisch:
 *   - Claimondo stellt dem Kunden nie etwas in Rechnung (geprueft 01.09.2026: in
 *     `abrechnungen` existiert keine einzige Rechnung mit empfaenger_typ='kunde').
 *     Diese Aussage ist damit fuer JEDEN Lead wahr.
 *   - "Du zahlst nichts" waere pauschal FALSCH: nur 62,7 % der Claims laufen ueber
 *     Haftpflicht (gegnerische VS zahlt). 14,5 % sind Selbstzahler, 10,8 % Kasko —
 *     dort traegt der Kunde Gutachten bzw. Selbstbeteiligung. Diese Nachricht geht an
 *     ALLE, also vor der Klaerung des Abrechnungswegs. Eine pauschale Zusage waere eine
 *     irrefuehrende Angabe (§ 5 UWG).
 */
export function buildWhatsAppText(opts: {
  vorname: string | null
  flowUrl: string
}): string {
  // ⚠ „Hallo", nicht „Hi". Seit der Umstellung auf die Sie-Anrede (Aaron 06.09.) stand hier
  // „Hi Ernest, danke für Ihre Schadenmeldung" — vertrauliche Begrüßung, förmlicher Rest.
  // Ein Stilbruch im ersten Satz der ersten Nachricht, die ein Geschädigter von uns bekommt.
  const greet = opts.vorname ? `Hallo ${opts.vorname}` : 'Hallo'
  return [
    `${greet}, danke für Ihre Schadenmeldung bei Claimondo.`,
    '',
    'Hier ist Ihr persönlicher Link (gültig 72 Stunden):',
    opts.flowUrl,
    '',
    'Dort unterschreiben Sie Vollmacht und Sicherungsabtretung — damit dürfen wir den ' +
      'Schaden für Sie abwickeln. Danach sehen Sie in Ihrem Portal jederzeit, wie es weitergeht.',
    '',
    'Unser Service ist für Sie kostenlos.',
  ].join('\n')
}

// Versand-State auf flow_links persistieren — dieselben drei Marker, die der
// App-Pfad schreibt (src/lib/start-link/persist-flowlink-versand.ts).
//
// Warum das hier sitzt und nicht bei den Aufrufern: KEINER der sieben
// Marketing-Versandpfade (home-lead-action, check, kfzgutachter-lp ×2,
// schaden-melden, mini-wizard, flowlink-fuer-lead) hat `gesendet_am` je gesetzt.
// Diese Funktion ist die einzige Stelle, die weiss, OB und ueber WELCHEN Kanal
// zugestellt wurde — hier gesetzt, gilt es fuer alle Aufrufer zugleich.
//
// ⭐ Was der fehlende Marker gekostet hat (31.08.2026): Bei der Frage
// "hat der Kunde von gestern seinen Link bekommen?" stand in `flow_links`
// gesendet_am = NULL, gesendet_anzahl = 0 — was wie ein stiller Fehlschlag
// aussah und fast als Ausfall gemeldet worden waere. Tatsaechlich WAR die
// WhatsApp raus (Beleg: `leads.status='flow-gesendet'` wird nur nach
// `versand.sent` gesetzt, plus eine timeline-Zeile "Magic-Link versendet").
// Der Marker war nie falsch — er wurde nur nie geschrieben. Ein Feld, das ein
// Pfad nie fuellt, ist als Messgroesse schlimmer als gar keins: es sieht aus
// wie eine Antwort.
//
// NICHT fire-and-forget: der Marker IST das Messinstrument. Fehler werden
// geloggt, brechen aber nichts — der Versand ist zu diesem Zeitpunkt bereits
// passiert und darf an einem DB-Fehler nicht scheitern.
async function persistiereVersandState(
  flowUrl: string,
  kanal: 'whatsapp' | 'email',
): Promise<void> {
  // Der Token kommt aus der URL, die tatsaechlich verschickt wurde — nicht ueber
  // die leadId nachgeschlagen: bei mehreren Links pro Lead traefe das den falschen.
  const token = flowUrl.split('/flow/')[1]?.split(/[?#]/)[0]
  if (!token) {
    console.error('[dispatchMagicLink] Kein Token in flowUrl — Versand-Marker nicht gesetzt')
    return
  }
  try {
    const admin = createAdminClient()
    // Read-modify-write fuers Increment: Sends auf EINEN Link sind nicht
    // nebenlaeufig (1 Lead = 1 Link), der Race ist vernachlaessigbar.
    const { data } = await admin
      .from('flow_links')
      .select('gesendet_anzahl')
      .eq('token', token)
      .maybeSingle()
    const { error } = await admin
      .from('flow_links')
      .update({
        gesendet_am: new Date().toISOString(),
        gesendet_kanal: kanal,
        gesendet_anzahl: ((data?.gesendet_anzahl as number | null) ?? 0) + 1,
      })
      .eq('token', token)
    if (error) {
      console.error('[dispatchMagicLink] Versand-Marker nicht gesetzt:', error.message)
    }
  } catch (err) {
    console.error('[dispatchMagicLink] Versand-Marker:', (err as Error).message)
  }
}

// flowlink_sent-Conversion (fire-and-forget). client_id aus dem Lead (nur
// gesetzt bei Consent) -> kein client_id = kein Send (consent-respektierend).
async function fireFlowlinkSentConversion(leadId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('leads')
      .select('ga_client_id')
      .eq('id', leadId)
      .maybeSingle()
    await trackServerConversion(data?.ga_client_id ?? null, {
      name: 'flowlink_sent',
      params: { source: 'magic_link' },
    })
  } catch {
    /* fire-and-forget — Tracking darf den Versand nie blockieren */
  }
}

export async function dispatchMagicLink(opts: {
  leadId: string
  telefon: string
  email: string
  vorname: string | null
  flowUrl: string
}): Promise<DispatchResult> {
  // Schritt 1: WA-Verfuegbarkeit aus Cache. Wenn leer, jetzt nachfragen —
  // sendNachricht (lib/whatsapp/send.ts) folgt dem gleichen Pattern.
  let wa = await getCachedAvailability('lead', opts.leadId)
  if (wa.geprueftAm === null && opts.telefon) {
    const fresh = await checkAndCacheAvailability('lead', opts.leadId, opts.telefon)
    wa = { verfuegbar: fresh.verfuegbar, geprueftAm: fresh.geprueftAm }
  }

  // Schritt 2: WA-Send wenn verfuegbar
  if (wa.verfuegbar === true) {
    const sent = await sendWhatsAppText(
      opts.telefon,
      buildWhatsAppText({ vorname: opts.vorname, flowUrl: opts.flowUrl }),
    )
    if (sent.ok) {
      await persistiereVersandState(opts.flowUrl, 'whatsapp')
      void fireFlowlinkSentConversion(opts.leadId)
      return {
        kanal: 'whatsapp',
        sent: true,
        detail: sent.messageId ?? '',
      }
    }
    // WA-Send fail → Email-Fallback
  }

  // Schritt 3: Email-Fallback (existierendes Template aus AAR-902)
  const email = await sendMiniWizardMagicLink(opts.leadId, opts.flowUrl)
  if (email.success) {
    await persistiereVersandState(opts.flowUrl, 'email')
    void fireFlowlinkSentConversion(opts.leadId)
    return { kanal: 'email', sent: true }
  }
  return {
    kanal: 'failed',
    sent: false,
    detail: email.error ?? 'Email-Versand fehlgeschlagen',
  }
}
