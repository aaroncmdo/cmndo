// AAR-518 (S1): Support-Bot-Chat-Endpoint.
//
// Agentic-Loop: Claude → (tool_use → Linear → tool_result → Claude) bis Ticket
// erstellt/kommentiert oder Rückfrage/Text zurückgegeben wird.
//
// Rollen: sachverstaendiger, admin, kundenbetreuer. Kunden sind NICHT
// zugelassen — Support-Widget läuft nur im internen Portal.

import { NextRequest, NextResponse } from 'next/server'
import type Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callSupportClaude, SUPPORT_CATEGORY_LABELS } from '@/lib/support/anthropic-client'
import { buildSystemPrompt } from '@/lib/support/system-prompt'
import { checkRateLimit, incrementRateLimit } from '@/lib/support/rate-limit'
import {
  addCommentToIssue,
  attachScreenshotToIssue,
  createLinearIssue,
  searchSimilarIssues,
  type SimilarIssue,
} from '@/lib/support/linear-client'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const ALLOWED_ROLES = new Set(['sachverstaendiger', 'admin', 'kundenbetreuer'])
const MAX_AGENT_ITERATIONS = 5

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
      { error: 'Support-Widget nur für SV/Admin/Kundenbetreuer verfügbar' },
      { status: 403 },
    )
  }

  let body: {
    messages?: IncomingMessage[]
    screenshot?: string | null
    screenshotUrl?: string | null
    pageUrl?: string | null
    voiceTranscript?: string | null
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

  const limit = await checkRateLimit(user.id)
  if (!limit.allowed) {
    return NextResponse.json(
      {
        error: 'Rate-Limit erreicht',
        message: `Du hast ${limit.used} Anfragen in dieser Stunde gestellt. Nächster Reset: ${limit.resetAt}.`,
        resetAt: limit.resetAt,
      },
      { status: 429 },
    )
  }
  await incrementRateLimit(user.id)

  const hasScreenshot = !!body.screenshot
  const hasVoice = !!body.voiceTranscript
  const systemPrompt = buildSystemPrompt({
    userRolle: rolle,
    userName: profile?.anzeigename ?? null,
    userEmail: profile?.email ?? user.email ?? null,
    pageUrl: body.pageUrl ?? null,
    hasScreenshot,
    hasVoice,
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
        })
        const reply: SupportResponse = {
          type: 'question',
          message: question || 'Kannst du das bitte konkretisieren?',
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
          })
          const reply: SupportResponse = {
            type: 'commented',
            message:
              assistantText ||
              'Danke — ich habe deinen Hinweis als Kommentar an das bestehende Ticket gehängt.',
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
          await logTicketAction({
            userId: user.id,
            actionType: 'new',
            issueId: issue.id,
            pageUrl: body.pageUrl ?? null,
            turnCount: iterations,
            hasScreenshot,
            hasVoice,
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
  })
  const reply: SupportResponse = {
    type: 'text',
    message:
      'Mir fehlen gerade Infos, um das sauber aufzunehmen. Magst du in einem Satz zusammenfassen, was genau schiefläuft?',
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
  const result = new Set<string>(['user-reported', 'ai-created'])
  let categoryFound = false
  for (const l of lower) {
    if ((SUPPORT_CATEGORY_LABELS as readonly string[]).includes(l) && !categoryFound) {
      result.add(l)
      categoryFound = true
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
  issueId: string | null
  pageUrl: string | null
  turnCount: number
  hasScreenshot: boolean
  hasVoice: boolean
}): Promise<void> {
  const db = createAdminClient()
  const { error } = await db.from('support_ticket_log').insert({
    user_id: params.userId,
    linear_issue_id: params.issueId,
    action_type: params.actionType,
    page_url: params.pageUrl,
    turn_count: params.turnCount,
    has_screenshot: params.hasScreenshot,
    has_voice: params.hasVoice,
  })
  if (error) console.error('[AAR-518] support_ticket_log insert fehlgeschlagen:', error.message)
}
