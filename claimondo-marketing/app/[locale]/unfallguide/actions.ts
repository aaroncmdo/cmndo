'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
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

const LeadSchema = z.object({
  name: z.string().min(2, 'Bitte Ihren Namen angeben').max(100).trim(),
  telefon: z
    .string()
    .regex(/[+0-9\s\-()]{8,}/, 'Bitte eine erreichbare Telefonnummer angeben'),
  email: z
    .union([z.string().trim().email('Diese E-Mail-Adresse sieht nicht gültig aus'), z.literal('')])
    .optional(),
  // Bewusst refine statt z.literal mit errorMap: die zweite Signatur von
  // z.literal hat sich zwischen den Zod-Generationen geaendert, refine traegt
  // in beiden und liefert dieselbe Meldung.
  einwilligung: z.string().refine((v) => v === 'ja', {
    message: 'Bitte bestätigen Sie, dass wir Sie zurückrufen dürfen',
  }),
})

export async function fordereUnfallguideAn(formData: FormData): Promise<GuideLeadErgebnis> {
  const parsed = LeadSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return {
      ok: false,
      error: issue?.message ?? 'Bitte prüfen Sie Ihre Eingaben',
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
      error: 'Wir konnten Ihre Anfrage nicht speichern. Der Guide steht trotzdem bereit, und unter 0151 5360 8515 erreichen Sie uns direkt.',
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
      error: 'Ihre Anfrage ist angekommen, die Verarbeitung läuft noch. Wir melden uns.',
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
    const { error: consentErr } = await sb
      .from('leads')
      .update({ dsgvo_zustimmung_am: new Date().toISOString() } as never)
      .eq('id', String(leadId))
    if (consentErr) console.error('[unfallguide] dsgvo_zustimmung_am am Lead:', consentErr.message)
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
  const kanal = await sendeWillkommen({
    leadId: String(leadId),
    telefon: parsed.data.telefon,
    email,
    vorname,
    flowUrl,
    zusage: fenster.text,
  })
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
 * Wann rufen wir zurueck — als Text FUER DEN KUNDEN und als Zeitpunkt FUER DEN
 * AUFTRAG. Bewusst EINE Funktion: die Nachricht, die der Kunde liest, und der
 * Termin, den das Team sieht, duerfen nicht auseinanderlaufen.
 */
function rueckrufFenster(): { text: string; startZeit: Date } {
  const jetzt = new Date()
  const teile = new Intl.DateTimeFormat('de-DE', {
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    timeZone: 'Europe/Berlin',
  }).formatToParts(jetzt)
  const stunde = Number(teile.find((t) => t.type === 'hour')?.value ?? '12') % 24
  const minute = Number(teile.find((t) => t.type === 'minute')?.value ?? '0')

  if (stunde >= 8 && stunde < 20) {
    return {
      text: 'Wir rufen Sie in der Regel innerhalb von 15 Minuten zurück.',
      startZeit: new Date(jetzt.getTime() + 15 * 60_000),
    }
  }
  // Ausserhalb der Zeit: der naechste Morgen um 8. Gerechnet wird als DIFFERENZ in
  // Minuten, nicht ueber ein konstruiertes Datum — letzteres braeuchte eine
  // Zeitzonen-Bibliothek und ginge an der Sommerzeit-Grenze schief.
  const stundenBis8 = stunde >= 20 ? 24 - stunde + 8 : 8 - stunde
  return {
    text: 'Wir rufen Sie morgen ab 8 Uhr zurück.',
    startZeit: new Date(jetzt.getTime() + (stundenBis8 * 60 - minute) * 60_000),
  }
}

async function sendeWillkommen(opts: {
  leadId: string
  telefon: string
  email: string | null
  vorname: string | null
  flowUrl: string | null
  /** Wortlaut aus rueckrufFenster() — derselbe, der im Rueckruf-Auftrag steht. */
  zusage: string
}): Promise<'whatsapp' | 'email' | 'nicht_versendet'> {
  const anrede = opts.vorname ? `Guten Tag ${opts.vorname},` : 'Guten Tag,'
  const zusage = opts.zusage
  const guideUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'}${GUIDE_PFAD}`

  // WhatsApp
  try {
    if (await isWhatsAppAvailable('lead', opts.leadId, opts.telefon)) {
      const text = [
        `${anrede} hier ist Ihr Unfallguide von Claimondo:`,
        guideUrl,
        '',
        zusage,
        ...(opts.flowUrl
          ? ['', 'Wenn Sie schon weiter sind und den Schaden direkt melden möchten:', opts.flowUrl]
          : []),
        '',
        'Der Service ist für Sie kostenlos. Bei unverschuldetem Unfall trägt die Gegenseite die Kosten.',
      ].join('\n')
      const r = await sendWhatsAppText(opts.telefon, text)
      if (r.ok) return 'whatsapp'
      console.error('[unfallguide] WhatsApp-Willkommen:', r.error)
    }
  } catch (err) {
    console.error('[unfallguide] WhatsApp-Willkommen fehlgeschlagen:', (err as Error).message)
  }

  // E-Mail mit Anhang
  if (!opts.email) return 'nicht_versendet'
  try {
    const pdf = await readFile(join(process.cwd(), 'public', GUIDE_PFAD))
    const flowZeile = opts.flowUrl
      ? `<p>Wenn Sie schon weiter sind und den Schaden direkt melden möchten: <a href="${opts.flowUrl}">${opts.flowUrl}</a></p>`
      : ''
    await sendEmail({
      to: opts.email,
      leadId: opts.leadId,
      subject: 'Ihr Unfallguide von Claimondo',
      text: `${anrede}\n\nim Anhang finden Sie Ihren Unfallguide (PDF, 6 Seiten). ${zusage}${
        opts.flowUrl ? `\n\nWenn Sie schon weiter sind: ${opts.flowUrl}` : ''
      }\n\nDer Service ist für Sie kostenlos. Bei unverschuldetem Unfall trägt die Gegenseite die Kosten.\n\nClaimondo · 0151 5360 8515`,
      html: `<p>${anrede}</p><p>im Anhang finden Sie Ihren Unfallguide (PDF, 6 Seiten). ${zusage}</p>${flowZeile}<p>Der Service ist für Sie kostenlos. Bei unverschuldetem Unfall trägt die Gegenseite die Kosten.</p><p>Claimondo · <a href="tel:+4915153608515">0151 5360 8515</a></p>`,
      attachments: [
        { filename: 'Claimondo-Unfallguide.pdf', content: pdf, contentType: 'application/pdf' },
      ],
    })
    return 'email'
  } catch (err) {
    console.error('[unfallguide] E-Mail-Willkommen fehlgeschlagen:', (err as Error).message)
    return 'nicht_versendet'
  }
}
