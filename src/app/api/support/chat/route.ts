// AAR-518 (S1): Support-Bot-Chat-Endpoint.
//
// Agentic-Loop: Claude → (tool_use → Linear → tool_result → Claude) bis Ticket
// erstellt/kommentiert oder Rückfrage/Text zurückgegeben wird.
//
// Rollen (Aaron 06.09.2026): INTERN sachverstaendiger, admin, kundenbetreuer — PARTNER
// makler, werkstatt, flottenmanager. Endkunden sind NICHT zugelassen: das Widget legt
// Linear-Tickets im Entwicklungs-Backlog an, das ist kein Kundensupport.
//
// ⚠ Der Knopf (<SupportButton>) und diese Liste muessen zusammenpassen. Vorher taten sie es
// nicht: der Knopf hing in Makler-, Werkstatt- und Flotten-Shell, waehrend die Liste sie
// abwies — rund 100 Nutzer sahen einen Knopf, der in ein 403 lief. Wer hier eine Rolle
// ergaenzt oder streicht, prueft die Shells mit.

import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendEmail } from '@/lib/email/google/client'
import { callSupportClaude, SUPPORT_CATEGORY_LABELS, SUPPORT_SEVERITY_LABELS } from '@/lib/support/anthropic-client'
import { buildSystemPrompt } from '@/lib/support/system-prompt'
import { checkRateLimit, incrementRateLimit, checkFeatureRateLimit, incrementFeatureRateLimit, FEATURE_REQUEST_LIMIT_PER_DAY } from '@/lib/support/rate-limit'
import {
  addCommentToIssue,
  attachScreenshotToIssue,
  createLinearIssue,
  searchSimilarIssues,
  type SimilarIssue,
} from '@/lib/support/linear-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// AAR-708 hatte 'kunde' aufgenommen ("Aaron will Tickets als Kunde anlegen koennen").
// Aaron 06.09.2026 zurueckgenommen: "kunde raus … makler werkstatt flotte rein".
// Zum Testen aus einer Kundensicht bleibt der Weg ueber ein Admin-Konto.
const ALLOWED_ROLES = new Set([
  'sachverstaendiger', 'admin', 'kundenbetreuer', 'dispatch',   // intern
  // 'dispatch' war nie in dieser Liste, steht aber in DURCHDENKEN_ROLES und bekommt den
  // Knopf ueber PortalUserFooter (DispatchNav) — dieselbe Luecke wie bei den Partnern.
  'makler', 'werkstatt', 'flottenmanager',          // Partner — arbeiten operativ im System
])
// AAR-625: Durchdenken-Modus nur für interne Rollen (nicht SV)
const DURCHDENKEN_ROLES = new Set(['admin', 'kundenbetreuer', 'dispatch'])
const MAX_AGENT_ITERATIONS = 5
const DURCHDENKEN_MAX_TURNS = 8

type IncomingMessage = { role: 'user' | 'assistant'; content: string }

type SupportResponse =
  | { type: 'question'; message: string; remaining: number }
  | { type: 'text'; message: string; remaining: number }
  | { type: 'commented'; message: string; issueIdentifier: string; commentUrl: string | null; remaining: number }
  | {
      type: 'created'
      message: string
      issueIdentifier: string
      issueUrl: string
      remaining: number
    }

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) {
    return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle, anzeigename, email')
    .eq('id', user.id)
    .maybeSingle()

  const rolle = profile?.rolle ?? ''
  if (!ALLOWED_ROLES.has(rolle)) {
    return NextResponse.json(
      { error: 'Das Support-Widget steht Ihrer Rolle nicht zur Verfügung.' },
      { status: 403 },
    )
  }

  let body: {
    messages?: IncomingMessage[]
    screenshot?: string | null
    screenshotUrl?: string | null
    pageUrl?: string | null
    voiceTranscript?: string | null
    mode?: 'normal' | 'durchdenken'
  }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Ungültiger Request-Body' }, { status: 400 })
  }

  const messages = Array.isArray(body.messages) ? body.messages : []
  if (!messages.length || messages[messages.length - 1].role !== 'user') {
    return NextResponse.json({ error: 'Letzte Nachricht muss vom User sein' }, { status: 400 })
  }

  const mode = body.mode === 'durchdenken' && DURCHDENKEN_ROLES.has(rolle) ? 'durchdenken' : 'normal'

  // AAR-625: Feature-Request-Tageslimit 3/Tag im Durchdenken-Modus
  if (mode === 'durchdenken') {
    const featureLimit = await checkFeatureRateLimit(user.id)
    if (!featureLimit.allowed) {
      return NextResponse.json(
        {
          error: 'Feature-Request-Limit erreicht',
          message: `Sie haben heute bereits ${FEATURE_REQUEST_LIMIT_PER_DAY} Feature-Requests eingereicht. Weitere morgen, oder sprich direkt mit Aaron wenn es dringend ist.`,
        },
        { status: 429 },
      )
    }
  }

  const limit = await checkRateLimit(user.id)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate-Limit erreicht',
        message: `Sie haben ${limit.used} Anfragen in dieser Stunde gestellt. Nächster Reset: ${limit.resetAt}.`,
        resetAt: limit.resetAt,
      },
      { status: 429 },
    )
  }
  await incrementRateLimit(user.id)

  const hasScreenshot = !!body.screenshot
  const hasVoice = !!body.voiceTranscript

  // Wortlaut der Meldung fuer Aufbewahrung + Benachrichtigung. Bis 08.09.2026 wurde er NIRGENDS
  // gespeichert: support_ticket_log hielt nur Metadaten, und der Linear-Pfad ist seit Mai tot.
  const meldungText =
    (body.messages ?? [])
      .filter((m) => m.role === 'user')
      .map((m) => (m.content ?? '').trim())
      .filter(Boolean)
        .join('\n\n---\n\n')
      .slice(0, 20000) || null
  const userTurnCount = messages.filter(m => m.role === 'user').length
  const systemPrompt = buildSystemPrompt({
    userRolle: rolle,
    userName: profile?.anzeigename ?? null,
    userEmail: profile?.email ?? user.email ?? null,
    pageUrl: body.pageUrl ?? null,
    hasScreenshot,
    hasVoice,
    mode,
    turnCount: userTurnCount,
  })

  // Letzte User-Message mit Screenshot + Voice-Notiz anreichern
  const anthropicMessages: Anthropic.Messages.MessageParam[] = messages.slice(0, -1).map(m => ({
    role: m.role,
    content: m.content,
  }))
  const lastUser = messages[messages.length - 1]
  const lastContent: Anthropic.Messages.ContentBlockParam[] = []
  const voicePrefix = body.voiceTranscript ? `Sprachnotiz (transkribiert): ${body.voiceTranscript}\n\n` : ''
  lastContent.push({ type: 'text', text: `${voicePrefix}${lastUser.content}` })
  if (body.screenshot) {
    const { mediaType, data } = parseDataUrl(body.screenshot)
    lastContent.push({
      type: 'image',
      source: { type: 'base64', media_type: mediaType, data },
    })
  }
  anthropicMessages.push({ role: 'user', content: lastContent })

  let iterations = 0
  while (iterations < MAX_AGENT_ITERATIONS) {
    iterations++
    const response = await callSupportClaude({
      system: systemPrompt,
      messages: anthropicMessages,
    })

    const toolUses = response.content.filter(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === 'tool_use',
    )
    const textBlocks = response.content.filter(
      (b): b is Anthropic.Messages.TextBlock => b.type === 'text',
    )
    const assistantText = textBlocks.map(b => b.text).join('\n').trim()

    // Kein Tool-Use → Text-Antwort, Ende (no_action)
    if (!toolUses.length) {
      await logTicketAction({
        userId: user.id,
        actionType: 'no_action',
        issueId: null,
        pageUrl: body.pageUrl ?? null,
        turnCount: iterations,
        hasScreenshot,
        hasVoice,
        meldungText,
        rolle,
        email: profile?.email ?? null,
      })
      const reply: SupportResponse = {
        type: 'text',
        message: assistantText || 'Okay.',
        remaining: Math.max(0, limit.remaining - 1),
      }
      return NextResponse.json(reply)
    }

    // Tool-Uses verarbeiten
    anthropicMessages.push({ role: 'assistant', content: response.content })
    const toolResults: Anthropic.Messages.ToolResultBlockParam[] = []

    for (const tool of toolUses) {
      const input = tool.input as Record<string, unknown>

      if (tool.name === 'ask_clarifying_question') {
        const question = String(input.question ?? '').trim()
        await logTicketAction({
          userId: user.id,
          actionType: 'no_action',
          issueId: null,
          pageUrl: body.pageUrl ?? null,
          turnCount: iterations,
          hasScreenshot,
          hasVoice,
          meldungText,
          rolle,
          email: profile?.email ?? null,
        })
        const reply: SupportResponse = {
          type: 'question',
          message: question || 'Können Sie das bitte konkretisieren?',
          remaining: Math.max(0, limit.remaining - 1),
        }
        return NextResponse.json(reply)
      }

      if (tool.name === 'search_similar_issues') {
        const query = String(input.query ?? '').trim()
        const searchLimit = typeof input.limit === 'number' ? input.limit : 5
        let hits: SimilarIssue[] = []
        try {
          hits = await searchSimilarIssues(query, searchLimit)
        } catch (err) {
          console.error('[AAR-518] searchSimilarIssues fehlgeschlagen:', err)
        }
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          content: JSON.stringify({
            query,
            count: hits.length,
            issues: hits.map(h => ({
              id: h.id,
              identifier: h.identifier,
              title: h.title,
              state: h.stateName,
              createdAt: h.createdAt,
            })),
          }),
        })
        continue
      }

      if (tool.name === 'comment_on_issue') {
        const issueId = String(input.issue_id ?? '').trim()
        const comment = String(input.comment ?? '').trim()
        if (!issueId || !comment) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({ error: 'issue_id und comment sind erforderlich' }),
            is_error: true,
          })
          continue
        }
        try {
          const enriched = enrichComment(comment, {
            rolle,
            userName: profile?.anzeigename ?? null,
            pageUrl: body.pageUrl ?? null,
          })
          const created = await addCommentToIssue(issueId, enriched)
          await logTicketAction({
            userId: user.id,
            actionType: 'comment',
            issueId,
            pageUrl: body.pageUrl ?? null,
            turnCount: iterations,
            hasScreenshot,
            hasVoice,
            meldungText,
            rolle,
            email: profile?.email ?? null,
          })
          const reply: SupportResponse = {
            type: 'commented',
            message:
              assistantText ||
              'Danke — ich habe Ihren Hinweis als Kommentar an das bestehende Ticket gehängt.',
            issueIdentifier: issueId,
            commentUrl: created?.url ?? null,
            remaining: Math.max(0, limit.remaining - 1),
          }
          return NextResponse.json(reply)
        } catch (err) {
          console.error('[AAR-518] addCommentToIssue fehlgeschlagen:', err)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({ error: 'Linear commentCreate fehlgeschlagen' }),
            is_error: true,
          })
          continue
        }
      }

      if (tool.name === 'create_linear_issue') {
        const title = String(input.title ?? '').trim().slice(0, 200)
        const description = String(input.description ?? '').trim()
        const rawLabels = Array.isArray(input.labels) ? (input.labels as string[]) : []
        const priority = typeof input.priority === 'number' ? input.priority : 3
        if (!title || !description) {
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({ error: 'title und description erforderlich' }),
            is_error: true,
          })
          continue
        }
        const labels = normaliseLabels(rawLabels)
        const enrichedDescription = enrichDescription(description, {
          rolle,
          userName: profile?.anzeigename ?? null,
          userEmail: profile?.email ?? user.email ?? null,
          pageUrl: body.pageUrl ?? null,
          hasScreenshot,
          hasVoice,
        })
        try {
          const issue = await createLinearIssue({
            title,
            description: enrichedDescription,
            labelNames: labels,
            priority,
          })
          if (body.screenshotUrl) {
            try {
              await attachScreenshotToIssue(issue.id, body.screenshotUrl)
            } catch (err) {
              console.error('[AAR-518] attachScreenshotToIssue fehlgeschlagen:', err)
            }
          }
          const isFeature = labels.includes('feature-request')
          if (isFeature && mode === 'durchdenken') {
            await incrementFeatureRateLimit(user.id)
          }
          await logTicketAction({
            userId: user.id,
            actionType: 'new',
            ticketTyp: isFeature ? 'feature' : 'bug',
            issueId: issue.id,
            pageUrl: body.pageUrl ?? null,
            turnCount: iterations,
            hasScreenshot,
            hasVoice,
            meldungText,
            rolle,
            email: profile?.email ?? null,
          })
          const reply: SupportResponse = {
            type: 'created',
            message:
              assistantText ||
              `Danke! Ich habe Ticket ${issue.identifier} angelegt. Das Team schaut es sich an.`,
            issueIdentifier: issue.identifier,
            issueUrl: issue.url,
            remaining: Math.max(0, limit.remaining - 1),
          }
          return NextResponse.json(reply)
        } catch (err) {
          console.error('[AAR-518] createLinearIssue fehlgeschlagen:', err)
          toolResults.push({
            type: 'tool_result',
            tool_use_id: tool.id,
            content: JSON.stringify({ error: 'Linear issueCreate fehlgeschlagen' }),
            is_error: true,
          })
          continue
        }
      }

      // Unbekanntes Tool → Fehler
      toolResults.push({
        type: 'tool_result',
        tool_use_id: tool.id,
        content: JSON.stringify({ error: `Unbekanntes Tool: ${tool.name}` }),
        is_error: true,
      })
    }

    anthropicMessages.push({ role: 'user', content: toolResults })
  }

  // Max-Iteration erreicht → Abbruch mit Hinweis
  await logTicketAction({
    userId: user.id,
    actionType: 'no_action',
    issueId: null,
    pageUrl: body.pageUrl ?? null,
    turnCount: iterations,
    hasScreenshot,
    hasVoice,
    meldungText,
    rolle,
    email: profile?.email ?? null,
  })
  const reply: SupportResponse = {
    type: 'text',
    message:
      'Mir fehlen gerade Infos, um das sauber aufzunehmen. Möchten Sie in einem Satz zusammenfassen, was genau schiefläuft?',
    remaining: Math.max(0, limit.remaining - 1),
  }
  return NextResponse.json(reply)
}

// ─── Helpers ───────────────────────────────────────────

function parseDataUrl(input: string): { mediaType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string } {
  const match = /^data:(image\/(png|jpeg|webp|gif));base64,(.+)$/i.exec(input)
  if (match) {
    const mime = match[1].toLowerCase() as 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'
    return { mediaType: mime, data: match[3] }
  }
  // Annahme: reines base64 ohne Prefix → als png interpretieren
  return { mediaType: 'image/png', data: input }
}

function normaliseLabels(input: string[]): string[] {
  const lower = input.map(l => l.toLowerCase().trim()).filter(Boolean)
  const result = new Set<string>(['user-reported', 'ai-created', 'support-widget'])
  let categoryFound = false
  for (const l of lower) {
    if ((SUPPORT_CATEGORY_LABELS as readonly string[]).includes(l) && !categoryFound) {
      result.add(l)
      categoryFound = true
    }
    // AAR-615+: Schweregrad-Labels durchlassen (backend-kritisch, ux-kritisch)
    if ((SUPPORT_SEVERITY_LABELS as readonly string[]).includes(l)) {
      result.add(l)
    }
  }
  if (!categoryFound) result.add('question')
  return Array.from(result)
}

function enrichComment(
  comment: string,
  ctx: { rolle: string; userName: string | null; pageUrl: string | null },
): string {
  const lines = [comment.trim()]
  const meta: string[] = []
  if (ctx.userName) meta.push(`User: ${ctx.userName}`)
  meta.push(`Rolle: ${ctx.rolle}`)
  if (ctx.pageUrl) meta.push(`Seite: ${ctx.pageUrl}`)
  lines.push('', `_(via Support-Bot — ${meta.join(' · ')})_`)
  return lines.join('\n')
}

function enrichDescription(
  description: string,
  ctx: {
    rolle: string
    userName: string | null
    userEmail: string | null
    pageUrl: string | null
    hasScreenshot: boolean
    hasVoice: boolean
  },
): string {
  const meta = ['## Kontext']
  if (ctx.userName) meta.push(`- User: ${ctx.userName}`)
  if (ctx.userEmail) meta.push(`- Email: ${ctx.userEmail}`)
  meta.push(`- Rolle: ${ctx.rolle}`)
  if (ctx.pageUrl) meta.push(`- Seite: ${ctx.pageUrl}`)
  if (ctx.hasScreenshot) meta.push('- Screenshot: wurde vom Bot analysiert (ggf. als Attachment angehängt)')
  if (ctx.hasVoice) meta.push('- Sprachnotiz: lag transkribiert vor')
  meta.push('')
  meta.push('_(Ticket angelegt via Support-Bot — AAR-517/AAR-518)_')

  // Wenn der Bot bereits ## Kontext geschrieben hat, ersetze diesen Abschnitt nicht —
  // sondern haenge unseren Meta-Block darunter als Quelle der Wahrheit.
  return `${description.trim()}\n\n${meta.join('\n')}`
}

async function logTicketAction(params: {
  userId: string
  actionType: 'new' | 'comment' | 'no_action'
  ticketTyp?: 'bug' | 'feature' | 'comment' | 'no_action'
  issueId: string | null
  pageUrl: string | null
  turnCount: number
  hasScreenshot: boolean
  hasVoice: boolean
  /**
   * Wortlaut der Meldung. Ab 08.09.2026 der massgebliche Aufbewahrungsort: der Linear-Pfad
   * darf ausfallen (LINEAR_API_KEY fehlt seit Mai 2026), ohne dass die Meldung verloren geht.
   */
  meldungText: string | null
  rolle: string
  email: string | null
}): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('support_ticket_log').insert({
    user_id: params.userId,
    linear_issue_id: params.issueId,
    action_type: params.actionType,
    meldung_text: params.meldungText,
    ticket_typ: params.ticketTyp ?? (params.actionType === 'comment' ? 'comment' : params.actionType === 'no_action' ? 'no_action' : 'bug'),
    page_url: params.pageUrl,
    turn_count: params.turnCount,
    has_screenshot: params.hasScreenshot,
    has_voice: params.hasVoice,
  })
  if (error) console.error('[AAR-518] support_ticket_log insert fehlgeschlagen:', error.message)

  // Aufbewahren (oben) und Benachrichtigen (hier) sind bewusst GETRENNT. Bis 08.09.2026 hingen
  // beide am selben externen Dienst: faellt Linear aus, ist die Meldung weg UND niemand erfaehrt
  // davon. Genau das ist seit Mai 2026 der Fall gewesen.
  // Non-critical (AGENTS.md, Server-Actions): ein Mailfehler darf das Protokoll nicht kippen.
  if (params.meldungText) {
    try {
      await benachrichtigeTeam(params)
    } catch (err) {
      console.error('[AAR-518] Support-Benachrichtigung fehlgeschlagen:', err)
    }
  }
}

/**
 * Empfaenger der Support-Benachrichtigung.
 *
 * Bewusst NICHT `info@claimondo.de`: tote Postfaecher haben hier bereits echte Warnungen
 * verschluckt (memory/AUDIT-tote-postfaecher-verschluckten-echte-warnungen). Die Adresse
 * gehoert in die Umgebung, damit sie ohne Code-Aenderung umgestellt werden kann.
 */
const SUPPORT_ALERT_EMPFAENGER = process.env.SUPPORT_ALERT_EMAIL || 'aaron.sprafke@claimondo.de'

function htmlEscape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function benachrichtigeTeam(params: {
  meldungText: string | null
  rolle: string
  email: string | null
  pageUrl: string | null
  issueId: string | null
}): Promise<void> {
  const zeile = (label: string, wert: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#4573A2;white-space:nowrap">${label}</td><td style="padding:4px 0">${wert}</td></tr>`

  const ablage = params.issueId
    ? `Linear-Ticket ${htmlEscape(params.issueId)}`
    : 'kein Ticket angelegt — die Meldung steht nur in support_ticket_log'

  await sendEmail({
    to: SUPPORT_ALERT_EMPFAENGER,
    subject: `Support-Meldung (${params.rolle})`,
    html: `<div style="font-family:system-ui,sans-serif;color:#0D1B3E;max-width:640px">
  <h2 style="margin:0 0 16px;font-size:18px">Neue Support-Meldung</h2>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
    ${zeile('Rolle', htmlEscape(params.rolle))}
    ${zeile('Melder', htmlEscape(params.email ?? 'unbekannt'))}
    ${zeile('Seite', htmlEscape(params.pageUrl ?? '-'))}
    ${zeile('Ablage', ablage)}
  </table>
  <div style="white-space:pre-wrap;background:#f8f9fb;border-left:3px solid #4573A2;padding:12px 16px;font-size:14px;line-height:1.5">${htmlEscape(params.meldungText ?? '')}</div>
</div>`,
    text: [
      `Neue Support-Meldung (${params.rolle})`,
      `Melder: ${params.email ?? 'unbekannt'}`,
      `Seite: ${params.pageUrl ?? '-'}`,
      `Ablage: ${params.issueId ? 'Linear ' + params.issueId : 'nur support_ticket_log'}`,
      '',
      params.meldungText ?? '',
    ].join('\n'),
    empfaengerTyp: 'admin',
    template: 'support-meldung',
    // Pflicht: ohne dieses Flag unterdrueckt die Send-Isolation jede @claimondo.de-Adresse —
    // die Benachrichtigung waere still nie angekommen. Der Fall ist genau der dokumentierte:
    // interne, transaktionale 1:1-Mail an das eigene Team.
    allowInternalRecipient: true,
  })
}
