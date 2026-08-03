// Pure: Ergebnisse -> Markdown. Deterministisch, keine I/O.

function row(r) {
  if (r.error) return `| ${r.query.id} | ${r.query.text} | ⚠ error | – | – |`
  const e = r.extract
  const flag = e.claimondo_cited ? '✅ zitiert' : e.claimondo_present ? '🟡 erwähnt' : e.no_web_result ? '– kein Web-Treffer' : '❌ fehlt'
  const s = r.scores ?? {}
  const comp = e.competitors_present.join(', ') || '–'
  return `| ${r.query.id} | ${r.query.text} | ${flag} | ${comp} | ${s.accuracy ?? '–'}/${s.sentiment ?? '–'}/${s.completeness ?? '–'} |`
}

export function renderReport({ runDate, results, aggregate }) {
  const a = aggregate
  const lines = []
  lines.push(`# AEO-Messung ${runDate}`)
  lines.push('')
  lines.push('**Engine (automatisiert):** Claude `claude-opus-4-8` + `web_search_20260209` (Live-Web-Grounding).')
  lines.push('')
  lines.push('## Aggregat')
  lines.push('')
  lines.push(`- **Präsenz:** ${a.present_count}/${a.total} Queries erwähnen Claimondo`)
  lines.push(`- **Zitiert:** ${a.cited_count}/${a.total} Queries zitieren eine Claimondo-Quelle`)
  lines.push(`- **Share-of-Voice:** Claimondo ${a.sov_claimondo} vs. Wettbewerber-Erwähnungen ${a.sov_competitors}`)
  lines.push(`- **Judge (Ø, 0–10):** Accuracy ${a.judge_avg.accuracy ?? '–'} · Sentiment ${a.judge_avg.sentiment ?? '–'} · Completeness ${a.judge_avg.completeness ?? '–'}`)
  lines.push(`- **Delta zur Mai-Baseline:** Mai = 0/40 Citations → jetzt Präsenz ${a.present_count}/${a.total}, zitiert ${a.cited_count}/${a.total}.`)
  lines.push('')
  lines.push('## Pro Query')
  lines.push('')
  lines.push('| ID | Query | Claimondo | Wettbewerber (erwähnt) | Judge A/S/C |')
  lines.push('|----|-------|-----------|------------------------|-------------|')
  for (const r of results) lines.push(row(r))
  lines.push('')
  lines.push('## Gap-Liste (verlorene Queries → wahrscheinlicher Fix)')
  lines.push('')
  lines.push('> Fix-Zuordnung ist manuell (Query-Cluster → Content-Typ). Beim Baseline-Lauf ausfüllen.')
  lines.push('')
  for (const q of a.lost) {
    const r = results.find((x) => x.query.id === q.id)
    const comp = r?.extract?.competitors_present?.join(', ') || (r?.error ? `error: ${r.error}` : '–')
    lines.push(`- **${q.text}** → Claimondo fehlt. Stattdessen präsent: ${comp}. Wahrscheinlicher Fix: _(manuell)_`)
  }
  lines.push('')
  lines.push('## Schicht B — Cross-Engine (manuell)')
  lines.push('')
  lines.push('_Google SERP / AI-Overview + ChatGPT/Perplexity/Gemini-Spot-Checks beim Baseline-Lauf eintragen._')
  lines.push('')
  lines.push('## Schicht C — Crawler-Logs (VPS)')
  lines.push('')
  lines.push('_AI-Bot-Hits (GPTBot/ClaudeBot/PerplexityBot/Google-Extended) auf den GEO-Routen beim Baseline-Lauf eintragen._')
  lines.push('')
  return lines.join('\n')
}
