// AAR-518 (S1): Anthropic-Client fürs Support-Bot-Widget.
//
// Exportiert die 4-Tool-Definition und einen dünnen Wrapper um die Messages-API.
// Modell kommt aus AI_MODELS.support_bot (Sonnet 4.6).

import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'

export const SUPPORT_CATEGORY_LABELS = ['bug', 'feature-request', 'ux', 'question'] as const
export type SupportCategoryLabel = (typeof SUPPORT_CATEGORY_LABELS)[number]

export const SUPPORT_TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: 'ask_clarifying_question',
    description:
      'Stelle dem Nutzer genau EINE Rückfrage, wenn die Beschreibung zu dünn ist, um ein sinnvolles Ticket zu erstellen. Maximal 2x pro Session verwenden.',
    input_schema: {
      type: 'object',
      properties: {
        question: {
          type: 'string',
          description: 'Die konkrete Rückfrage an den Nutzer, kurz und auf Deutsch.',
        },
      },
      required: ['question'],
    },
  },
  {
    name: 'search_similar_issues',
    description:
      'Durchsuche Linear nach bestehenden Tickets, die zum Report des Nutzers passen könnten. MUSS IMMER zuerst aufgerufen werden, bevor ein neues Ticket angelegt wird.',
    input_schema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: '3-6 deutsche Kernbegriffe aus dem Problem des Nutzers.',
        },
        limit: {
          type: 'integer',
          description: 'Maximale Treffer (default 5, max 10).',
          minimum: 1,
          maximum: 10,
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'comment_on_issue',
    description:
      'Hänge den Report des Nutzers als Kommentar an ein bestehendes Linear-Ticket, wenn er bestätigt hat dass es dasselbe Problem ist.',
    input_schema: {
      type: 'object',
      properties: {
        issue_id: {
          type: 'string',
          description: 'Die Linear-Issue-ID (UUID) aus search_similar_issues.',
        },
        comment: {
          type: 'string',
          description:
            'Der Kommentar-Text als Markdown. Enthält Kurzbeschreibung + Kontext + Hinweis "(via Support-Bot)".',
        },
      },
      required: ['issue_id', 'comment'],
    },
  },
  {
    name: 'create_linear_issue',
    description:
      'Lege ein neues Linear-Ticket an. Nur aufrufen, wenn search_similar_issues keine passenden Kandidaten geliefert hat (oder der Nutzer bestätigt hat, dass keiner passt).',
    input_schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
          description: 'Prägnanter deutscher Titel, max 80 Zeichen.',
        },
        description: {
          type: 'string',
          description:
            'Markdown-Beschreibung mit ## Problem, ## Schritte zum Reproduzieren (optional), ## Erwartetes Verhalten, ## Kontext.',
        },
        labels: {
          type: 'array',
          items: { type: 'string' },
          description:
            'IMMER ["user-reported", "ai-created"] plus genau EINE Kategorie aus "bug", "feature-request", "ux", "question".',
        },
        priority: {
          type: 'integer',
          description: 'Linear-Priorität: 0 none, 1 urgent, 2 high, 3 medium, 4 low. Default 3.',
          minimum: 0,
          maximum: 4,
        },
      },
      required: ['title', 'description', 'labels'],
    },
  },
]

export type SupportClaudeParams = {
  system: string
  messages: Anthropic.Messages.MessageParam[]
  maxTokens?: number
}

let client: Anthropic | null = null
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY ist nicht konfiguriert.')
    client = new Anthropic({ apiKey })
  }
  return client
}

export async function callSupportClaude(
  params: SupportClaudeParams,
): Promise<Anthropic.Messages.Message> {
  const anthropic = getClient()
  return anthropic.messages.create({
    model: AI_MODELS.support_bot,
    max_tokens: params.maxTokens ?? 1024,
    system: params.system,
    tools: SUPPORT_TOOLS,
    messages: params.messages,
  })
}
