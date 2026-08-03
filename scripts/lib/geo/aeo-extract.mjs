// Pure, deterministisch: leitet aus den akkumulierten Antwort-Bloecken die
// objektiven Signale ab. KEINE Modell-Bewertung (die macht der Judge).

export const CLAIMONDO_DOMAINS = ['claimondo.de', 'app.claimondo.de', 'autounfall.io']

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Wort-Grenze + case-insensitiv. "Klimondo" matcht NICHT "claimondo".
export function mentionsBrand(text, brand) {
  if (!text) return false
  return new RegExp(`\\b${escapeRegex(brand)}\\b`, 'i').test(text)
}

export function answerText(content) {
  return (content ?? [])
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text)
    .join('\n')
    .trim()
}

// Defensiver Walk: Retrieved-URLs (web_search_tool_result) + Cited-URLs (text.citations).
export function collectUrls(content) {
  const retrieved = []
  const cited = []
  for (const block of content ?? []) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'web_search_tool_result' && Array.isArray(block.content)) {
      for (const r of block.content) if (r && typeof r.url === 'string') retrieved.push(r.url)
    }
    if (block.type === 'text' && Array.isArray(block.citations)) {
      for (const c of block.citations) if (c && typeof c.url === 'string') cited.push(c.url)
    }
  }
  return { retrieved, cited }
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return null
  }
}

export function domainHit(urls, domains) {
  return urls.some((u) => {
    const host = hostOf(u)
    if (!host) return false
    return domains.some((d) => host === d || host.endsWith('.' + d))
  })
}

export function extractQueryResult(content, competitors) {
  const answer_text = answerText(content)
  const { retrieved, cited } = collectUrls(content)
  const competitors_present = competitors.filter((c) => mentionsBrand(answer_text, c.name)).map((c) => c.name)
  const competitors_cited = competitors
    .filter((c) => domainHit(cited, c.domains) || domainHit(retrieved, c.domains))
    .map((c) => c.name)
  return {
    claimondo_present: mentionsBrand(answer_text, 'claimondo'),
    claimondo_cited: domainHit(cited, CLAIMONDO_DOMAINS),
    claimondo_retrieved: domainHit(retrieved, CLAIMONDO_DOMAINS),
    competitors_present,
    competitors_cited,
    no_web_result: retrieved.length === 0 && cited.length === 0,
    answer_text,
  }
}
