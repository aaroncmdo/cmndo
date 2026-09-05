'use server'

import { z } from 'zod'
import { headers } from 'next/headers'
import { createServiceClient } from '@/lib/supabase/server'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { erzeugeUndSendeFlowLink } from '@/lib/leads/flowlink-fuer-lead'
import { erfasseLeadAttribution } from '@/lib/analytics/oaiq-capi'
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
//    ACHTUNG: `anfragen.dsgvo_zustimmung_am` existiert, aber der RPC traegt
//    ihn NICHT nach `leads` (gegen prod geprueft). Der Nachweis lebt also in
//    der Anfrage-Zeile, nicht am Lead. Wer das am Lead braucht, muss den RPC
//    erweitern — bewusst nicht in diesem PR.
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
      beschreibung: `Über claimondo.de/unfallguide. Rückruf zugesagt (8–20 Uhr).${
        email ? ' E-Mail angegeben.' : ' Keine E-Mail angegeben.'
      }${utm.utm_source ? ` Quelle: ${utm.utm_source}${utm.utm_campaign ? ` / ${utm.utm_campaign}` : ''}.` : ''}`,
      metadata: { quelle: QUELLE, gegenwert: 'unfallguide', utm },
    })
    if (tlErr) console.error('[unfallguide] Timeline-Eintrag:', tlErr.message)
  }

  // FlowLink: sein Weg zurueck in den eigenen Vorgang. NON-FATAL — der Lead
  // steht bereits, ein Versand-Fehler darf ihn nicht kippen.
  try {
    const fl = await erzeugeUndSendeFlowLink({
      leadId: String(leadId),
      telefon: parsed.data.telefon,
      vorname: parsed.data.name.trim().split(/\s+/)[0] ?? null,
      quelle: 'Unfallguide',
    })
    if (!fl.ok) console.error('[unfallguide] FlowLink:', fl.error)
  } catch (err) {
    console.error('[unfallguide] FlowLink-Versand fehlgeschlagen:', (err as Error).message)
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
