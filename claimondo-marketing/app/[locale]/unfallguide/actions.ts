'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { erzeugeUndSendeFlowLink } from '@/lib/leads/flowlink-fuer-lead'
import { erfasseLeadAttribution } from '@/lib/analytics/oaiq-capi'
import { isWhatsAppAvailable } from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendEmail } from '@/lib/email/google/client'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
// Konstante und Typen liegen in constants.ts: aus einem 'use server'-Modul
// duerfen nur async-Funktionen exportiert werden (AGENTS.md, AAR-664).
import { GUIDE_PFAD, type GuideLeadFeld, type GuideLeadErgebnis } from './constants'

// Lead-Server-Action der Unfallguide-Landeseite.
//
// Der Weg ist bewusst derselbe wie bei der Ads-Landeseite (kfzgutachter-lp):
// zuerst eine `anfragen`-Zeile (Inbox + Audit), dann atomic
// `convert_anfrage_zu_lead`. Scheitert der Convert, bleibt die Anfrage stehen
// und der Fall ist nachverfolgbar, statt spurlos zu verschwinden.
//
// DREI UNTERSCHIEDE zur Ads-Landeseite, jeder mit Grund:
//
// 1. E-MAIL IST OPTIONAL, ABER VORGESEHEN. Die Ads-Seite nimmt nur Name +
//    Telefon; damit landet JEDER Lead im Zustand "Telefon ohne E-Mail" — genau
//    die Gruppe, die im WhatsApp-Ausfall vom Juli 2026 vier Wochen lang nichts
//    bekam, weil der E-Mail-Weg der einzige war, der weiterlief (gemessen:
//    12 von 97 Leads sind heute in diesem Zustand). `anfragen.kontakt_email`
//    existiert, und `convert_anfrage_zu_lead` traegt den Wert nach
//    `leads.email` (gegen prod geprueft) — es kostet also nur das Feld.
//
// 2. EINWILLIGUNG WIRD FESTGEHALTEN. Die Seite kuendigt einen Rueckruf an;
//    § 7 UWG verlangt fuer Werbeanrufe bei Verbrauchern eine vorherige
//    ausdrueckliche Einwilligung. Dass der Nutzer den Rueckruf selbst
//    anfordert, spricht dafuer — festgehalten werden muss es trotzdem.
//    Der Nachweis steht an ZWEI Stellen: auf der `anfragen`-Zeile (dort setzt
//    ihn dieser Code beim Insert) und am Lead. Letzteres ist noetig, weil der
//    RPC `convert_anfrage_zu_lead` den Wert NICHT weitertraegt (gegen prod
//    geprueft) — gesucht wird er aber auf `leads.dsgvo_zustimmung_am`. Statt
//    den RPC zu erweitern (er hat andere Aufrufer) setzt die Action ihn direkt
//    nach der Konversion nach.
//
// 3. DIE AUSLIEFERUNG HAENGT NICHT AM VERSAND. Der Guide erscheint direkt
//    nach dem Absenden auf der Seite. FlowLink und Rueckruf kommen dazu, aber
//    der Gegenwert ist geliefert, bevor irgendein Kanal beteiligt ist.

const QUELLE = 'unfallguide'

/**
 * Das Schema haengt an der Sprache, weil seine Meldungen beim NUTZER landen.
 * Ein Formular, das auf Tuerkisch fragt und auf Deutsch schimpft, ist nicht
 * uebersetzt — der Fehlerfall ist der Moment, in dem Verstaendlichkeit am
 * meisten zaehlt.
 */
type Uebersetzer = (schluessel: string) => string

function bauLeadSchema(t: Uebersetzer) {
  return z.object({
  name: z.string().min(2, t('fehler_name')).max(100).trim(),
  telefon: z.string().regex(/[+0-9\s\-()]{8,}/, t('fehler_telefon')),
  email: z
    .union([z.string().trim().email(t('fehler_email')), z.literal('')])
    .optional(),
  // Bewusst refine statt z.literal mit errorMap: die zweite Signatur von
  // z.literal hat sich zwischen den Zod-Generationen geaendert, refine traegt
  // in beiden und liefert dieselbe Meldung.
  einwilligung: z.string().refine((v) => v === 'ja', {
    message: t('fehler_einwilligung'),
  }),
  // Sprache der Seite, verstecktes Feld aus dem Formular.
  //
  // ⚠ BEWUSST aus dem Formular und NICHT per `getLocale()`: eine Server-Action
  // laeuft nicht unter der Seiten-URL, `requestLocale` ist dort leer, und
  // next-intl faellt still auf 'de' zurueck. Das Ergebnis waere kein Fehler,
  // sondern etwas Schlimmeres — jeder Lead traegt 'de', die Spalte sieht
  // gepflegt aus und misst nichts. Optional, damit ein Absenden ohne das Feld
  // (alter Cache, JS-Eigenheit) den Lead nicht verliert.
  sprache: z.string().optional(),
  })
}

/** Erlaubt sind genau die Werte des CHECK auf `leads.sprache` (gegen prod gelesen). */
const SPRACHEN = ['de', 'en', 'tr', 'ar', 'ru', 'pl'] as const

function gueltigeSprache(wert: string | undefined): string {
  return (SPRACHEN as readonly string[]).includes(wert ?? '') ? (wert as string) : 'de'
}

export async function fordereUnfallguideAn(formData: FormData): Promise<GuideLeadErgebnis> {
  // Die Sprache wird VOR der Pruefung gelesen, weil die Pruefung ihre Meldungen
  // in genau dieser Sprache ausgibt. Roh aus dem Formular, dann gegen die
  // erlaubten Werte gefiltert — ein manipuliertes Feld faellt auf 'de' zurueck
  // und kann den CHECK nicht verletzen.
  const sprache = gueltigeSprache(String(formData.get('sprache') ?? '') || undefined)
  const t = await getTranslations({ locale: sprache, namespace: 'unfallguide.formular' })

  const parsed = bauLeadSchema(t).safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? t('fehler_allgemein'),
      feld: (issue?.path[0] as GuideLeadFeld | undefined) ?? undefined,
    }
  }

  const h = await headers()
  const xff = h.get('x-forwarded-for') ?? ''
  const clientIp = (xff.split(',')[0] ?? '').trim() || h.get('x-real-ip') || null

  const utm = {
    utm_source: String(formData.get('utm_source') ?? '') || null,
    utm_medium: String(formData.get('utm_medium') ?? '') || null,
    utm_campaign: String(formData.get('utm_campaign') ?? '') || null,
    utm_term: String(formData.get('utm_term') ?? '') || null,
    utm_content: String(formData.get('utm_content') ?? '') || null,
  }

  const sb = createServiceClient()
  const email = parsed.data.email?.trim() || null
  // Einmal bestimmt, dreifach genutzt: Timeline-Eintrag, Rueckruf-Auftrag und
  // Willkommensnachricht sagen damit garantiert dasselbe.
  const fenster = rueckrufFenster()

  const { data: anfrage, error: anfrageFehler } = await sb
    .from('anfragen')
    .insert({
      quelle: QUELLE,
      quelle_url: h.get('referer') ?? null,
      ...utm,
      kontakt_name: parsed.data.name,
      kontakt_telefon: parsed.data.telefon,
      kontakt_email: email,
      dsgvo_zustimmung_am: new Date().toISOString(),
      payload: { gegenwert: 'unfallguide' },
      client_ip: clientIp,
      user_agent: h.get('user-agent') ?? null,
    })
    .select('id')
    .single()

  if (anfrageFehler || !anfrage) {
    console.error('[unfallguide] Anfrage-Insert fehlgeschlagen:', anfrageFehler?.message)
    // Der Guide wird trotzdem freigegeben: der Nutzer hat seinen Teil getan,
    // und ein Fehler auf unserer Seite darf ihm den Gegenwert nicht wegnehmen.
    return {
      ok: false,
      error: t('fehler_speichern'),
      guidePfad: GUIDE_PFAD,
    }
  }

  const { data: leadId, error: convertFehler } = await sb.rpc('convert_anfrage_zu_lead', {
    p_anfrage_id: anfrage.id,
  })

  if (convertFehler || !leadId) {
    console.error(
      '[unfallguide] Convert fehlgeschlagen:',
      convertFehler?.message,
      'anfrageId:',
      anfrage.id,
    )
    return {
      ok: false,
      error: t('hinweis_verarbeitung'),
      guidePfad: GUIDE_PFAD,
    }
  }

  // Attribution festhalten, solange das __oppref-Cookie noch erreichbar ist.
  // Ohne Anzeigenklick oder Marketing-Consent ein No-op.
  await erfasseLeadAttribution(String(leadId))

  // EINWILLIGUNG AUCH AM LEAD. Sie steht bereits auf der `anfragen`-Zeile, aber der
  // RPC traegt sie nicht weiter — und gesucht/gezaehlt wird der Nachweis (§ 7 UWG,
  // Art. 7 DSGVO) auf `leads.dsgvo_zustimmung_am` (Spalte kam mit Migration
  // 20260704113818). Ohne diese Zeile haette ein Guide-Lead die Einwilligung, ohne
  // dass sie dort steht, wo jemand sie sucht.
  // `as never`: die generierten Marketing-Typen kennen die Spalte am leads-Block noch
  // nicht (Type-Lag; Haus-Muster aus create-lead-from-mini-wizard.ts).
  // ⚠ Anders als dort wird der Fehler hier GELESEN — `leads` ist eine kritische
  // Tabelle, und ein try/catch um supabase-js faengt nichts (es wirft nicht).
  {
    // Sprache faehrt im SELBEN Statement mit wie die Einwilligung: ein Feld
    // mehr, kein zweiter Schreibvorgang, und der Fehler wird bereits geprueft.
    //
    // Warum sie ueberhaupt an den Lead gehoert: der Dispatcher sieht sie damit,
    // BEVOR er waehlt. Ein deutscher Rueckruf bei einem tuerkischen Kunden ist
    // ein verbrannter Rueckruf — der Kunde legt auf, der Auftrag bleibt offen,
    // und niemand weiss warum. `leads_sprache_check` erlaubt genau diese sechs
    // Werte plus 'other' (gegen prod gelesen, keine Migration noetig).
    const { error: consentErr } = await sb
      .from('leads')
      .update({ dsgvo_zustimmung_am: new Date().toISOString(), sprache } as never)
      .eq('id', String(leadId))
    if (consentErr)
      console.error('[unfallguide] Einwilligung/Sprache am Lead:', consentErr.message)
  }

  // RUECKRUF-AUFTRAG. Landeseite, Guide und Willkommensnachricht versprechen einen
  // Rueckruf — bis hierhin entstand daraus KEIN Arbeitsanker, nur Benachrichtigungen.
  // Eine Benachrichtigung verschwindet, eine Aufgabe bleibt liegen, bis jemand sie
  // erledigt. Muster und Spaltenwahl aus `erstelleOeffentlichenRueckruf`
  // (typ='rueckruf', status='offen' — beide Werte stehen so im CHECK von admin_termine).
  // `erstellt_von` ist Pflichtspalte, einen eingeloggten Nutzer gibt es hier nicht ->
  // erster Dispatch-Account, ersatzweise ein Admin.
  try {
    const { data: kandidaten, error: profErr } = await sb
      .from('profiles')
      .select('id, rolle')
      .in('rolle', ['dispatch', 'admin'])
      .limit(20)
    if (profErr) console.error('[unfallguide] Traeger-Lookup:', profErr.message)
    const traeger = kandidaten?.find((k) => k.rolle === 'dispatch') ?? kandidaten?.[0] ?? null

    if (!traeger) {
      console.error('[unfallguide] Kein Dispatch-/Admin-Profil — Rückruf-Auftrag NICHT angelegt')
    } else {
      const { error: terminErr } = await sb.from('admin_termine').insert({
        typ: 'rueckruf',
        status: 'offen',
        titel: `Rückruf: ${parsed.data.name}`,
        beschreibung: [
          `Tel: ${parsed.data.telefon}`,
          email ? `E-Mail: ${email}` : null,
          'Quelle: Unfallguide (claimondo.de/unfallguide)',
          `Zugesagt: ${fenster.text}`,
        ]
          .filter(Boolean)
          .join('\n'),
        start_zeit: fenster.startZeit.toISOString(),
        end_zeit: new Date(fenster.startZeit.getTime() + 30 * 60_000).toISOString(),
        lead_id: String(leadId),
        erstellt_von: traeger.id as string,
        erinnerung_min_vorher: 10,
      })
      if (terminErr) console.error('[unfallguide] Rückruf-Auftrag:', terminErr.message)
    }
  } catch (err) {
    console.error('[unfallguide] Rückruf-Auftrag fehlgeschlagen:', (err as Error).message)
  }

  // Erster Eintrag der Aktivitaetsspur. `timeline.lead_id` hat sechs Schreiber
  // (SA-Unterschrift, Dokumente, FlowLink-Versand, Reminder, Notizen) und seit
  // dieser Lane einen Leser: LeadVerlaufPanel auf der Dispatch-Seite. Ohne diese
  // Zeile begaenne die Spur eines Guide-Leads erst beim naechsten Ereignis, und
  // niemand saehe, WIE er hereinkam. `typ: 'system'` ist die Konvention aller
  // 53 bestehenden Lead-Eintraege. Non-fatal: der Lead steht bereits.
  {
    const { error: tlErr } = await sb.from('timeline').insert({
      lead_id: String(leadId),
      typ: 'system',
      titel: 'Unfallguide angefordert',
      beschreibung: `Über claimondo.de/unfallguide. ${fenster.text}${
        email ? ' E-Mail angegeben.' : ' Keine E-Mail angegeben.'
      }${utm.utm_source ? ` Quelle: ${utm.utm_source}${utm.utm_campaign ? ` / ${utm.utm_campaign}` : ''}.` : ''}`,
      metadata: { quelle: QUELLE, gegenwert: 'unfallguide', utm },
    })
    if (tlErr) console.error('[unfallguide] Timeline-Eintrag:', tlErr.message)
  }

  // FlowLink NUR ERZEUGEN, nicht ueber den Helfer versenden. Dessen Nachricht
  // lautet "danke fuer deine Schadenmeldung ... dort unterschreibst du Vollmacht
  // und Sicherungsabtretung" — und duzt. Wer einen Guide angefordert hat, hat
  // keinen Schaden gemeldet, und der Guide siezt. Zwei Brueche in der ersten
  // Nachricht, genau die Sorte, die der Plan als "Du oder Sie?" offen liess.
  // Mit `telefon: null` liefert der Helfer den Token, ohne zu senden (nachgelesen:
  // er kehrt vor dem Versand zurueck). Die Willkommensnachricht unten traegt den
  // Link dann zurueckhaltend mit — "wenn Sie schon weiter sind".
  const vorname = parsed.data.name.trim().split(/\s+/)[0] ?? null
  let flowUrl: string | null = null
  try {
    const fl = await erzeugeUndSendeFlowLink({
      leadId: String(leadId),
      telefon: null,
      vorname,
      quelle: 'Unfallguide',
    })
    if (fl.ok && fl.token && process.env.NEXT_PUBLIC_APP_URL) {
      flowUrl = `${process.env.NEXT_PUBLIC_APP_URL}/flow/${fl.token}`
    } else if (!fl.ok) {
      console.error('[unfallguide] FlowLink:', fl.error)
    }
  } catch (err) {
    console.error('[unfallguide] FlowLink-Erzeugung fehlgeschlagen:', (err as Error).message)
  }

  // Willkommensnachricht: WhatsApp mit Link, sonst E-Mail MIT PDF-Anhang.
  // Der Guide ist zu diesem Zeitpunkt schon auf der Seite geliefert; die
  // Nachricht ist die Zugabe, nicht die Bedingung. NON-FATAL.
  const willkommen = await sendeWillkommen({
    leadId: String(leadId),
    telefon: parsed.data.telefon,
    email,
    vorname,
    flowUrl,
    zusageSchluessel: fenster.schluessel,
    zusageStunde: fenster.stunde,
    // Eigener Uebersetzer fuer den Nachrichten-Namensraum, gebaut fuer die
    // Sprache des Leads — nicht fuer die Sprache irgendeines Request-Kontexts.
    t: await getTranslations({ locale: sprache, namespace: 'unfallguide.nachricht' }),
  })
  const kanal = willkommen.kanal

  // DIE NACHRICHT GEHOERT IN DEN NACHRICHTENVERLAUF, nicht nur ins Postfach.
  // Die Lead-Detailseite im Dispatch hat ein Nachrichten-Panel, das `nachrichten`
  // nach `lead_id` liest. Ohne diese Zeile sieht der Dispatcher zwar den
  // Verlaufseintrag "Willkommensnachricht versendet", aber nicht, WAS drinstand —
  // er kann also nicht daran anknuepfen, wenn er gleich anruft.
  // `kanal` und `status` sind gegen den CHECK von `nachrichten` geprueft
  // (whatsapp/email bzw. gesendet). NON-FATAL: der Lead und der Versand stehen schon.
  if (kanal !== 'nicht_versendet') {
    const { error: nErr } = await sb.from('nachrichten').insert({
      lead_id: String(leadId),
      kanal,
      richtung: 'outbound',
      status: 'gesendet',
      sender_rolle: 'system',
      is_system: true,
      nachricht: willkommen.text,
      hat_anhang: willkommen.hatAnhang,
      empfaenger_kontakt: willkommen.empfaenger,
      template_key: 'unfallguide_willkommen',
    })
    if (nErr) console.error('[unfallguide] Nachrichtenverlauf:', nErr.message)
  }
  {
    const { error: tlErr } = await sb.from('timeline').insert({
      lead_id: String(leadId),
      typ: 'system',
      titel:
        kanal === 'nicht_versendet'
          ? 'Willkommensnachricht NICHT versendet'
          : `Willkommensnachricht per ${kanal === 'whatsapp' ? 'WhatsApp' : 'E-Mail'} versendet`,
      beschreibung:
        kanal === 'whatsapp'
          ? `An ${parsed.data.telefon}: Guide-Link${flowUrl ? ' + FlowLink' : ''}, Rückruf angekündigt.`
          : kanal === 'email'
            ? `An ${email}: Guide als PDF-Anhang${flowUrl ? ' + FlowLink' : ''}, Rückruf angekündigt.`
            : 'Kein WhatsApp erreichbar und keine E-Mail angegeben. Der Guide wurde auf der Seite angezeigt.',
      metadata: { quelle: QUELLE, kanal, flowlink: Boolean(flowUrl) },
    })
    if (tlErr) console.error('[unfallguide] Timeline-Eintrag (Willkommen):', tlErr.message)
  }

  // Team-Benachrichtigung. Ohne sie waere das hier die naechste stumme
  // Lead-Quelle — von dreizehn waren neun stumm (Audit 30.08.2026).
  // Zwei Wege, wie bei der Ads-Landeseite: in-app fuer Dispatch/Admin, und
  // der gemeinsame Helfer fuer Email + WhatsApp ans Team.
  // Fire-and-forget: der Lead ist wichtiger als die Meldung.
  try {
    const { data: empfaenger } = await sb
      .from('profiles')
      .select('id')
      .in('rolle', ['dispatch', 'admin'])
    if (empfaenger && empfaenger.length > 0) {
      const beschreibung = [QUELLE, parsed.data.telefon, email].filter(Boolean).join(' · ')
      const { error: benErr } = await sb.from('benachrichtigungen').insert(
        empfaenger.map((p) => ({
          user_id: p.id,
          typ: 'neuer-lead',
          titel: `Unfallguide angefordert: ${parsed.data.name}`,
          beschreibung,
          link: `/dispatch/leads/${String(leadId)}`,
        })),
      )
      if (benErr) console.error('[unfallguide] Benachrichtigung:', benErr.message)
    }
  } catch (err) {
    console.error('[unfallguide] Benachrichtigung fehlgeschlagen:', (err as Error).message)
  }

  // Email an info@claimondo.de + WhatsApp ans Team. Gekapselt im gemeinsamen
  // Helfer (Aaron-Direktive 20.05.2026), damit nicht jede Lead-Quelle ihre
  // eigene Variante baut. Intern fire-and-forget.
  await notifyNewLead({
    leadId: String(leadId),
    source: 'claimondo.de (Unfallguide)',
    name: parsed.data.name,
    phone: parsed.data.telefon,
    email,
    utm,
    extraFields: [{ label: 'Gegenwert', value: 'Unfallguide (PDF)' }],
  })

  return { ok: true, guidePfad: GUIDE_PFAD }
}

// ─── Willkommensnachricht ───────────────────────────────────────────────────
//
// Reihenfolge: WhatsApp, wenn die Nummer dort erreichbar ist; sonst E-Mail,
// wenn eine angegeben wurde; sonst nichts (der Guide liegt ohnehin auf der Seite).
// Der Rueckruf wird TAGESZEITABHAENGIG angekuendigt: "in 15 Minuten" um 22 Uhr
// ist ein Versprechen, das an dem Abend niemand haelt.
//
// WhatsApp bekommt den LINK, E-Mail bekommt die DATEI: der Baileys-/send-
// Endpunkt sendet Text; der E-Mail-Client kann Anhaenge. Das ist keine
// Notloesung — der Link ist messbar und austauschbar, die Datei liegt im Postfach.

/**
 * Erreichbarkeit — BELEGT, nicht geschaetzt: die Zeiten stehen als
 * `openingHoursSpecification` in `lib/seo/jsonld.ts` und gehen von dort als
 * strukturierte Daten an Google. Index = getDay()-Konvention (0 = Sonntag).
 *
 * ⚠ Vorher rechnete diese Datei mit 8-20 an JEDEM Tag. Am Wochenende war das
 * falsch in beide Richtungen: Samstag 08:30 wurde "in 15 Minuten" zugesagt,
 * obwohl erst ab 9 jemand da ist, und Sonntag 19:00 ebenso, obwohl um 18 Uhr
 * Schluss ist. Ein Versprechen, das an dem Tag niemand halten kann.
 */
const ERREICHBAR: Record<number, { von: number; bis: number }> = {
  0: { von: 9, bis: 18 }, // Sonntag
  1: { von: 8, bis: 20 },
  2: { von: 8, bis: 20 },
  3: { von: 8, bis: 20 },
  4: { von: 8, bis: 20 },
  5: { von: 8, bis: 20 },
  6: { von: 9, bis: 18 }, // Samstag
}

const WOCHENTAG_INDEX: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
}

/**
 * Wann rufen wir zurueck — als Text FUER DEN KUNDEN und als Zeitpunkt FUER DEN
 * AUFTRAG. Bewusst EINE Funktion: die Nachricht, die der Kunde liest, und der
 * Termin, den das Team sieht, duerfen nicht auseinanderlaufen.
 *
 * Gerechnet wird durchgehend als DIFFERENZ in Minuten auf `Date.now()`, nie ueber
 * ein konstruiertes Datum — letzteres braeuchte eine Zeitzonen-Bibliothek und
 * ginge an der Sommerzeit-Grenze schief.
 */
/**
 * Zwei Ausgaben, mit Absicht:
 *
 * - `text` ist DEUTSCH und geht in den internen Rueckruf-Auftrag. Den liest der
 *   Dispatcher, nicht der Kunde.
 * - `schluessel` + `stunde` gehen an den KUNDEN und werden in seiner Sprache
 *   ausformuliert. Ein hier fertig zusammengebauter Satz waere nicht
 *   uebersetzbar: „heute ab 9 Uhr" hat in jeder Sprache eine andere
 *   Wortstellung, und ein zerlegter Satz laesst sie nicht zu.
 */
function rueckrufFenster(): {
  text: string
  schluessel: 'zusage_sofort' | 'zusage_heute' | 'zusage_morgen'
  stunde: number
  startZeit: Date
} {
  const jetzt = new Date()
  // `en-US` fuer den Wochentag: die Kuerzel sind stabil (Mon/Tue/...), waehrend
  // die deutschen je nach ICU-Version mit oder ohne Punkt kommen.
  const teile = new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'Europe/Berlin',
  }).formatToParts(jetzt)
  const tag = WOCHENTAG_INDEX[teile.find((t) => t.type === 'weekday')?.value ?? 'Mon'] ?? 1
  const stunde = Number(teile.find((t) => t.type === 'hour')?.value ?? '12') % 24
  const minute = Number(teile.find((t) => t.type === 'minute')?.value ?? '0')
  const jetztMin = stunde * 60 + minute

  const heute = ERREICHBAR[tag]
  if (jetztMin >= heute.von * 60 && jetztMin < heute.bis * 60) {
    return {
      text: 'Wir rufen Sie in der Regel innerhalb von 15 Minuten zurück.',
      schluessel: 'zusage_sofort',
      stunde: heute.von,
      startZeit: new Date(jetzt.getTime() + 15 * 60_000),
    }
  }

  // Vor der Oeffnung: heute noch. Nach dem Schluss: naechster Tag, dessen
  // Oeffnungszeit sich vom heutigen unterscheiden kann (Fr 21 Uhr -> Sa ab 9).
  if (jetztMin < heute.von * 60) {
    return {
      text: `Wir rufen Sie heute ab ${heute.von} Uhr zurück.`,
      schluessel: 'zusage_heute',
      stunde: heute.von,
      startZeit: new Date(jetzt.getTime() + (heute.von * 60 - jetztMin) * 60_000),
    }
  }
  const morgen = ERREICHBAR[(tag + 1) % 7]
  return {
    text: `Wir rufen Sie morgen ab ${morgen.von} Uhr zurück.`,
    schluessel: 'zusage_morgen',
    stunde: morgen.von,
    startZeit: new Date(jetzt.getTime() + (24 * 60 - jetztMin + morgen.von * 60) * 60_000),
  }
}

/**
 * Was tatsaechlich rausging. Nicht nur der Kanal: der Wortlaut wird gebraucht, damit
 * die Nachricht auch im Nachrichtenverlauf des Leads steht und nicht nur im Postfach
 * des Kunden.
 */
type WillkommenErgebnis = {
  kanal: 'whatsapp' | 'email' | 'nicht_versendet'
  text: string
  empfaenger: string | null
  hatAnhang: boolean
}

async function sendeWillkommen(opts: {
  leadId: string
  telefon: string
  email: string | null
  vorname: string | null
  flowUrl: string | null
  /** Schluessel + Stunde aus rueckrufFenster(), hier in der Kundensprache ausformuliert. */
  zusageSchluessel: 'zusage_sofort' | 'zusage_heute' | 'zusage_morgen'
  zusageStunde: number
  /** Uebersetzer fuer `unfallguide.nachricht`, gebaut fuer die Sprache des Leads. */
  t: (schluessel: string, werte?: Record<string, string | number>) => string
}): Promise<WillkommenErgebnis> {
  const t = opts.t
  const anrede = opts.vorname
    ? t('anrede_mit_name', { vorname: opts.vorname })
    : t('anrede_ohne_name')
  const zusage = t(opts.zusageSchluessel, { stunde: opts.zusageStunde })
  const guideUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}${GUIDE_PFAD}`

  // WhatsApp
  try {
    if (await isWhatsAppAvailable('lead', opts.leadId, opts.telefon)) {
      const text = [
        `${anrede} ${t('wa_einleitung')}`,
        guideUrl,
        '',
        zusage,
        ...(opts.flowUrl ? ['', t('flow_lang'), opts.flowUrl] : []),
        '',
        t('kostenlos'),
      ].join('\n')
      const r = await sendWhatsAppText(opts.telefon, text)
      if (r.ok) {
        return { kanal: 'whatsapp', text, empfaenger: opts.telefon, hatAnhang: false }
      }
      console.error('[unfallguide] WhatsApp-Willkommen:', r.error)
    }
  } catch (err) {
    console.error('[unfallguide] WhatsApp-Willkommen fehlgeschlagen:', (err as Error).message)
  }

  // E-Mail mit Anhang
  if (!opts.email) return { kanal: 'nicht_versendet', text: '', empfaenger: null, hatAnhang: false }
  try {
    const pdf = await readFile(join(process.cwd(), 'public', GUIDE_PFAD))
    const flowZeile = opts.flowUrl
      ? `<p>${t('flow_lang')} <a href="${opts.flowUrl}">${opts.flowUrl}</a></p>`
      : ''
    // Einmal gebaut, zweimal gebraucht: als Mail-Text und als Eintrag im
    // Nachrichtenverlauf. Was der Kunde liest, steht damit auch beim Team.
    const mailText = `${anrede}\n\n${t('mail_einleitung')} ${zusage}${
      opts.flowUrl ? `\n\n${t('flow_kurz')} ${opts.flowUrl}` : ''
    }\n\n${t('kostenlos')}\n\nClaimondo · 0151 5360 8515`
    await sendEmail({
      to: opts.email,
      leadId: opts.leadId,
      subject: t('mail_betreff'),
      text: mailText,
      html: `<p>${anrede}</p><p>${t('mail_einleitung')} ${zusage}</p>${flowZeile}<p>${t('kostenlos')}</p><p>Claimondo · <a href="tel:+4915153608515">0151 5360 8515</a></p>`,
      attachments: [
        { filename: 'Claimondo-Unfallguide.pdf', content: pdf, contentType: 'application/pdf' },
      ],
    })
    return { kanal: 'email', text: mailText, empfaenger: opts.email, hatAnhang: true }
  } catch (err) {
    console.error('[unfallguide] E-Mail-Willkommen fehlgeschlagen:', (err as Error).message)
    return { kanal: 'nicht_versendet', text: '', empfaenger: null, hatAnhang: false }
  }
}
