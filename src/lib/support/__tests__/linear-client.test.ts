// AAR-518: Unit-Tests für searchSimilarIssues — prüft Mapping + Limit-Cap.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

describe('searchSimilarIssues', () => {
  const originalFetch = globalThis.fetch

  beforeEach(() => {
    process.env.LINEAR_API_KEY = 'lin_test'
    process.env.LINEAR_TEAM_ID = 'team-uuid'
  })

  afterEach(() => {
    globalThis.fetch = originalFetch
    vi.resetModules()
  })

  it('mappt Linear-Nodes auf SimilarIssue-Objekte', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({
          data: {
            issues: {
              nodes: [
                {
                  id: 'issue-1',
                  identifier: 'CLA-42',
                  title: 'Bug: Login bricht ab',
                  url: 'https://linear.app/test/issue/CLA-42',
                  createdAt: '2026-04-01T10:00:00Z',
                  state: { name: 'Backlog' },
                },
              ],
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { searchSimilarIssues } = await import('../linear-client')
    const hits = await searchSimilarIssues('Login bricht ab', 5)

    expect(hits).toHaveLength(1)
    expect(hits[0]).toEqual({
      id: 'issue-1',
      identifier: 'CLA-42',
      title: 'Bug: Login bricht ab',
      url: 'https://linear.app/test/issue/CLA-42',
      stateName: 'Backlog',
      createdAt: '2026-04-01T10:00:00Z',
    })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { variables: { first: number; filter: unknown } }
    expect(body.variables.first).toBe(5)
  })

  it('cappt das Limit auf 10', async () => {
    const fetchMock = vi.fn(async () =>
      new Response(JSON.stringify({ data: { issues: { nodes: [] } } }), { status: 200 }),
    )
    globalThis.fetch = fetchMock as unknown as typeof fetch

    const { searchSimilarIssues } = await import('../linear-client')
    await searchSimilarIssues('query', 50)

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    const body = JSON.parse(init.body as string) as { variables: { first: number } }
    expect(body.variables.first).toBe(10)
  })

  it('wirft Fehler bei GraphQL-Errors-Block', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(
        JSON.stringify({ errors: [{ message: 'Unauthorized' }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    ) as unknown as typeof fetch

    const { searchSimilarIssues } = await import('../linear-client')
    await expect(searchSimilarIssues('x', 3)).rejects.toThrow(/Unauthorized/)
  })

  it('gibt leeres Array zurück wenn nodes fehlt', async () => {
    globalThis.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ data: { issues: {} } }), { status: 200 }),
    ) as unknown as typeof fetch

    const { searchSimilarIssues } = await import('../linear-client')
    const hits = await searchSimilarIssues('x', 3)
    expect(hits).toEqual([])
  })
})
