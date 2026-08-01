import nodemailer from 'nodemailer'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { resend, isResendAvailable } from '@/lib/email/resend-client'
import { htmlToPlainText } from '@/lib/email/plain-text'
import { resolveSideEffectRecipient } from '@/lib/side-effects/mode'
import { nurZustellbareEmpfaenger } from '@/lib/testdaten/interne-identitaet'

// Google Workspace Limit: 2000 Mails/Tag pro User
const transporter = nodemailer.createTransport({
  host: process.env.GMAIL_SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.GMAIL_SMTP_PORT || '587'),
  secure: false, // STARTTLS auf Port 587
  auth: {
    user: process.env.GMAIL_SMTP_USER || '',
    pass: process.env.GMAIL_SMTP_PASS || '', // App-Passwort, NICHT normales Passwort
  },
})

type SendEmailOpts = {
  to: string | string[]
  subject: string
  html: string
  text?: string
  attachments?: Array<{ filename: string; content: Buffer | string; contentType?: string }>
  replyTo?: string
  /** @deprecated Wird ignoriert — alle Sends gehen von RESEND_FROM/GMAIL_SMTP_FROM. */
  from?: string
  fallId?: string | null
  empfaengerTyp?: 'kunde' | 'sv' | 'kanzlei' | 'admin' | 'makler' | 'werkstatt'
  template?: string
  /** One-Click-Abmelde-URL → List-Unsubscribe-Header (UWG/Gmail-Bulk-Anforderung). */
  listUnsubscribe?: string
  /**
   * Resend-Idempotency-Key. Verhindert, dass die 3x-Retry-Schleife bei einem Timeout NACH
   * Annahme (Antwort verloren) eine zweite echte Mail schickt. Pflicht fuer Sends, deren
   * Duplikat nicht zurueckholbar ist (z.B. Unfallmeldung an einen fremden Versicherer).
   * Nur der Resend-Pfad wertet ihn aus (SMTP kennt keine Idempotenz).
   */
  idempotencyKey?: string
  /**
   * Umgeht die Send-Isolation fuer interne/Test-Adressen (@claimondo.de etc.). NUR fuer
   * explizit admin-ausgeloeste, transaktionale 1:1-Mails setzen, deren interner Empfaenger
   * die GEWOLLTE Zielperson ist (z.B. Werkstatt-/Partner-Login-Zugang) — NICHT fuer Funnel-/
   * Matching-/Reminder-Sends (dort schuetzt die Isolation echte SVs vor Test-Leads). Der
   * SIDE_EFFECT-Dry-Run-Gate bleibt unberuehrt (Smoke-Runs unterdruecken weiterhin).
   */
  allowInternalRecipient?: boolean
}

export async function sendEmail(opts: SendEmailOpts): Promise<{ messageId: string }> {
  // KFZ-189: Zentraler Sender — from-Overrides werden ignoriert
  if (opts.from) {
    console.warn(`[email] from-Override ignoriert: "${opts.from}" → nutze env RESEND_FROM/GMAIL_SMTP_FROM`)
  }
  const from = process.env.GMAIL_SMTP_FROM || 'Claimondo <noreply@claimondo.de>'
  // Side-Effect-Gate (Prod-Smoke): dry-run unterdrueckt den Send, test-recipient leitet um.
  // Default (SIDE_EFFECT_MODE unset) = live -> unveraendert.
  {
    const realTo = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to
    const se = resolveSideEffectRecipient('email', realTo || '')
    if (se.suppress) {
      console.warn(`[side-effect:${se.mode}] Email UNTERDRUECKT -> "${realTo}" subject="${opts.subject}"`)
      return { messageId: `side-effect-suppressed-${Date.now()}` }
    }
    if (se.mode === 'test-recipient' && se.recipient !== realTo) {
      console.warn(`[side-effect:test-recipient] Email UMLEITUNG "${realTo}" -> ${se.recipient}`)
      opts = { ...opts, to: se.recipient }
    }
    // Send-Isolation (2026-07-03): im Live-Modus interne/Test-Empfaenger (@claimondo.de etc.)
    // nie real anmailen — letzte Verteidigungslinie neben dem Booking-Guard. NUR live, damit
    // test-recipient (bewusste Umleitung an Test-Inbox) nicht faelschlich unterdrueckt wird.
    // Zustellbar = extern ODER operative Betriebs-Inbox (info@/schaden@ via
    // nurZustellbareEmpfaenger): letztere sind gewollte Alert-/Handoff-Ziele (Team-Lead-Alert,
    // Embed-Dispatch, Kanzlei-Mandat), NIE Matching-Bystander -> sie werden zugestellt.
    // Ausnahme dazu: allowInternalRecipient (admin-getriggerte 1:1-Transaktionsmail an den
    // Empfaenger selbst, z.B. Werkstatt-Login ODER Founder-Adress-Alerts wie Stripe-Drift an
    // aaron.sprafke@) — dort ist die interne Adresse die gewollte Zielperson, kein Bystander-SV.
    // Der Funnel-/Matching-/Reminder-Schutz (echte Test-SV-Identitaeten) bleibt intakt.
    if (se.mode === 'live' && !opts.allowInternalRecipient) {
      const empfaenger = Array.isArray(opts.to) ? opts.to : [opts.to]
      const zustellbar = nurZustellbareEmpfaenger(empfaenger)
      if (zustellbar.length === 0) {
        console.warn(`[send-isolation] Email an rein interne/Test-Adresse(n) unterdrueckt: "${empfaenger.join(', ')}" subject="${opts.subject}"`)
        return { messageId: `internal-recipient-suppressed-${Date.now()}` }
      }
      if (zustellbar.length !== empfaenger.length) {
        opts = { ...opts, to: zustellbar }
      }
    }
  }
  const admin = createAdminClient()
  // CMM-49: email_log ist claim-gekeyt; interim faelle.claim_id-Lookup aus opts.fallId
  // (P4-TODO: claimId aus dem sendEmail-Caller-Kontext threaden statt fall_id).
  let claimId: string | null = null
  if (opts.fallId) {
    claimId = await resolveClaimId(admin, opts.fallId)
  }
  const toAddr = Array.isArray(opts.to) ? opts.to.join(', ') : opts.to

  // P4 Plain-Text-Multipart: Text-Alternative zentral ableiten, wenn der Caller
  // keinen expliziten Text mitgibt — deckt damit ALLE sendEmail-Caller (inkl.
  // dynamischer Template-Importe in Cron/Webhook) in einem Schritt ab.
  const text = opts.text ?? htmlToPlainText(opts.html)

  if (!toAddr) {
    // Log failed
    await admin.from('email_log').insert({
      claim_id: claimId,
      empfaenger: '',
      empfaenger_typ: opts.empfaengerTyp ?? 'admin',
      template: opts.template ?? 'unknown',
      subject: opts.subject,
      status: 'failed',
      fehler: 'Keine Email-Adresse',
      versuche: 1,
    })
    throw new Error('Keine Email-Adresse')
  }

  // Determine provider upfront
  const provider = isResendAvailable() && resend ? 'resend' : 'google_smtp'

  // Insert pending log
  const { data: logEntry } = await admin.from('email_log').insert({
    claim_id: claimId,
    empfaenger: toAddr,
    empfaenger_typ: opts.empfaengerTyp ?? 'admin',
    template: opts.template ?? 'unknown',
    subject: opts.subject,
    status: 'pending',
    versuche: 0,
    provider,
    attachments: opts.attachments ? opts.attachments.map(a => ({ filename: a.filename, contentType: a.contentType })) : null,
  }).select('id').single()

  const logId = logEntry?.id

  // ─── Resend-Pfad (wenn RESEND_API_KEY gesetzt) ───────────────────────────
  if (isResendAvailable() && resend) {
    let lastError: Error | null = null
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const result = await resend.emails.send({
          from: process.env.RESEND_FROM || 'Claimondo <noreply@claimondo.de>',
          to: Array.isArray(opts.to) ? opts.to : [opts.to],
          subject: opts.subject,
          html: opts.html,
          text,
          replyTo: opts.replyTo,
          attachments: opts.attachments?.map(a => ({
            filename: a.filename,
            content: Buffer.isBuffer(a.content) ? a.content : Buffer.from(a.content),
          })),
          headers: opts.listUnsubscribe
            ? {
                'List-Unsubscribe': `<${opts.listUnsubscribe}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              }
            : undefined,
        }, opts.idempotencyKey ? { idempotencyKey: opts.idempotencyKey } : undefined)

        const messageId = result.data?.id ?? `resend-${Date.now()}`

        if (logId) {
          await admin.from('email_log').update({
            status: 'sent',
            message_id: messageId,
            versuche: attempt,
            gesendet_am: new Date().toISOString(),
          }).eq('id', logId)
        }

        return { messageId }
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (logId) {
          await admin.from('email_log').update({ versuche: attempt, fehler: lastError.message }).eq('id', logId)
        }
        if (attempt < 3) await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }

    if (logId) {
      await admin.from('email_log').update({ status: 'failed', fehler: lastError?.message ?? 'Unbekannter Fehler' }).eq('id', logId)
    }
    throw lastError ?? new Error('Email-Versand via Resend fehlgeschlagen')
  }

  // ─── Google SMTP Fallback ───────────────────────────────────────────────
  let lastError: Error | null = null
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const result = await transporter.sendMail({
        from,
        to: toAddr,
        subject: opts.subject,
        html: opts.html,
        text,
        replyTo: opts.replyTo,
        attachments: opts.attachments?.map(a => ({
          filename: a.filename,
          content: a.content,
          contentType: a.contentType,
        })),
      })

      // Log success
      if (logId) {
        await admin.from('email_log').update({
          status: 'sent',
          message_id: result.messageId,
          versuche: attempt,
          gesendet_am: new Date().toISOString(),
        }).eq('id', logId)
      }

      return { messageId: result.messageId }
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))

      if (logId) {
        await admin.from('email_log').update({
          versuche: attempt,
          fehler: lastError.message,
        }).eq('id', logId)
      }

      if (attempt < 3) {
        await new Promise(r => setTimeout(r, attempt * 2000))
      }
    }
  }

  // Final failure
  if (logId) {
    await admin.from('email_log').update({
      status: 'failed',
      fehler: lastError?.message ?? 'Unbekannter Fehler',
    }).eq('id', logId)
  }

  throw lastError ?? new Error('Email-Versand fehlgeschlagen')
}
