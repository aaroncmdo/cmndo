// AAR-518 (S1): Linear-GraphQL-Client fürs Support-Bot-Widget.
//
// Dünner Wrapper um die vier GraphQL-Operationen, die der Bot braucht:
//   createLinearIssue, attachScreenshotToIssue, searchSimilarIssues, addCommentToIssue
// Plus resolveLabelIds als Helper (Label-Namen → IDs).
//
// Env:
//   LINEAR_API_KEY   Personal API Key (Linear Settings > API)
//   LINEAR_TEAM_ID   Team-UUID (aus der Team-URL)

const LINEAR_API = 'https://api.linear.app/graphql'

type GraphQLResult<T> = { data?: T; errors?: Array<{ message: string }> }

function getAuth(): { apiKey: string; teamId: string } {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_TEAM_ID
  if (!apiKey) throw new Error('LINEAR_API_KEY ist nicht konfiguriert.')
  if (!teamId) throw new Error('LINEAR_TEAM_ID ist nicht konfiguriert.')
  return { apiKey, teamId }
}

async function linearGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const { apiKey } = getAuth()
  const res = await fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Linear GraphQL HTTP ${res.status}: ${text.slice(0, 200)}`)
  }
  const json = (await res.json()) as GraphQLResult<T>
  if (json.errors?.length) {
    throw new Error(`Linear GraphQL Error: ${json.errors.map(e => e.message).join('; ')}`)
  }
  if (!json.data) throw new Error('Linear GraphQL: leere Antwort')
  return json.data
}

// ─── Label-Resolver ─────────────────────────────────────

type LabelNode = { id: string; name: string }

export async function resolveLabelIds(names: string[]): Promise<string[]> {
  if (!names.length) return []
  const { teamId } = getAuth()
  const lowerNames = names.map(n => n.toLowerCase())
  const data = await linearGraphQL<{ team: { labels: { nodes: LabelNode[] } } }>(
    `query($teamId: String!) {
      team(id: $teamId) {
        labels(first: 250) { nodes { id name } }
      }
    }`,
    { teamId },
  )
  const nodes = data.team?.labels?.nodes ?? []
  const byName = new Map(nodes.map(n => [n.name.toLowerCase(), n.id]))
  const ids: string[] = []
  for (const wanted of lowerNames) {
    const id = byName.get(wanted)
    if (id) ids.push(id)
    else console.warn(`[AAR-518] Linear-Label "${wanted}" nicht gefunden — wird uebersprungen.`)
  }
  return ids
}

// ─── createLinearIssue ─────────────────────────────────

export type CreateIssueParams = {
  title: string
  description: string
  labelNames: string[]
  priority?: number
}

export type CreatedIssue = {
  id: string
  identifier: string
  url: string
  title: string
}

export async function createLinearIssue(params: CreateIssueParams): Promise<CreatedIssue> {
  const { teamId } = getAuth()
  const labelIds = await resolveLabelIds(params.labelNames)
  const data = await linearGraphQL<{
    issueCreate: { success: boolean; issue: CreatedIssue | null }
  }>(
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue { id identifier url title }
      }
    }`,
    {
      input: {
        teamId,
        title: params.title,
        description: params.description,
        labelIds,
        priority: params.priority ?? 3,
      },
    },
  )
  if (!data.issueCreate.success || !data.issueCreate.issue) {
    throw new Error('Linear issueCreate fehlgeschlagen.')
  }
  return data.issueCreate.issue
}

// ─── attachScreenshotToIssue ───────────────────────────

export async function attachScreenshotToIssue(
  issueId: string,
  screenshotUrl: string,
  title = 'Screenshot',
): Promise<{ id: string; url: string } | null> {
  const data = await linearGraphQL<{
    attachmentCreate: { success: boolean; attachment: { id: string; url: string } | null }
  }>(
    `mutation($input: AttachmentCreateInput!) {
      attachmentCreate(input: $input) {
        success
        attachment { id url }
      }
    }`,
    { input: { issueId, title, url: screenshotUrl } },
  )
  if (!data.attachmentCreate.success) return null
  return data.attachmentCreate.attachment
}

// ─── searchSimilarIssues ───────────────────────────────

export type SimilarIssue = {
  id: string
  identifier: string
  title: string
  url: string
  stateName: string
  createdAt: string
}

export async function searchSimilarIssues(query: string, limit = 5): Promise<SimilarIssue[]> {
  const { teamId } = getAuth()
  const capped = Math.max(1, Math.min(limit, 10))
  const data = await linearGraphQL<{
    issues: {
      nodes: Array<{
        id: string
        identifier: string
        title: string
        url: string
        createdAt: string
        state: { name: string }
      }>
    }
  }>(
    `query($filter: IssueFilter!, $first: Int!) {
      issues(filter: $filter, first: $first, orderBy: updatedAt) {
        nodes {
          id
          identifier
          title
          url
          createdAt
          state { name }
        }
      }
    }`,
    {
      first: capped,
      filter: {
        team: { id: { eq: teamId } },
        or: [
          { title: { containsIgnoreCase: query } },
          { description: { containsIgnoreCase: query } },
        ],
      },
    },
  )
  return (data.issues?.nodes ?? []).map(n => ({
    id: n.id,
    identifier: n.identifier,
    title: n.title,
    url: n.url,
    stateName: n.state?.name ?? 'Unbekannt',
    createdAt: n.createdAt,
  }))
}

// ─── addCommentToIssue ─────────────────────────────────

export async function addCommentToIssue(
  issueId: string,
  body: string,
): Promise<{ id: string; url: string } | null> {
  const data = await linearGraphQL<{
    commentCreate: { success: boolean; comment: { id: string; url: string } | null }
  }>(
    `mutation($input: CommentCreateInput!) {
      commentCreate(input: $input) {
        success
        comment { id url }
      }
    }`,
    { input: { issueId, body } },
  )
  if (!data.commentCreate.success) return null
  return data.commentCreate.comment
}
